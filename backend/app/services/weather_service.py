"""
TNImpact Weather Intelligence Service
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Fetches real-time weather data from Open-Meteo (free, unlimited, no API key required).
Provides:
  - Per-coordinate weather condition and travel speed multipliers
  - Severity classification for constraint engine alerts
  - Tamil Nadu / India-specific monsoon detection
"""
import httpx
import asyncio
from datetime import datetime
from typing import Optional
from app.core.logger import logger


# ── WMO Weather Code → (condition_label, speed_penalty_multiplier) ──────────────
# Multiplier > 1.0 means travel takes longer. Source: WMO Code Table 4677
_WMO_CONDITIONS: list[tuple[range, str, float]] = [
    (range(0,   1),  "clear",         1.00),
    (range(1,   4),  "partly_cloudy", 1.03),
    (range(10,  13), "mist",          1.20),
    (range(40,  50), "fog",           1.45),
    (range(51,  58), "drizzle",       1.15),
    (range(58,  60), "heavy_drizzle", 1.25),
    (range(61,  66), "rain",          1.30),
    (range(66,  68), "freezing_rain", 1.55),
    (range(80,  83), "showers",       1.35),
    (range(83,  85), "heavy_showers", 1.50),
    (range(95,  97), "thunderstorm",  1.60),
    (range(97, 100), "heavy_storm",   1.75),
]


def _decode_wmo(code: int) -> tuple[str, float]:
    """Returns (condition_label, travel_multiplier) for a WMO weather code."""
    for r, cond, mult in _WMO_CONDITIONS:
        if code in r:
            return cond, mult
    return "clear", 1.0


def _is_monsoon_season() -> bool:
    """Tamil Nadu Northeast Monsoon: Oct–Dec. Southwest: Jun–Sep."""
    month = datetime.now().month
    return month in (6, 7, 8, 9, 10, 11, 12)


class WeatherService:
    """
    Singleton service for weather-aware routing intelligence.

    Usage:
        weather = weather_service  # pre-built singleton
        data = await weather.get_weather(13.0827, 80.2707)
        # → {"condition": "rain", "multiplier": 1.3, "severity": "MEDIUM", ...}
    """
    BASE_URL = "https://api.open-meteo.com/v1/forecast"
    _cache: dict[str, dict] = {}   # Simple in-memory cache: key = "lat_lng", TTL ~10 min
    _cache_time: dict[str, float] = {}
    CACHE_TTL_SEC = 600            # 10-minute cache prevents hammering the free API

    async def get_weather(self, lat: float, lng: float) -> dict:
        """
        Fetches current weather conditions for a coordinate.

        Returns dict with:
            condition       : str  — human label (e.g. "rain", "thunderstorm")
            weather_code    : int  — raw WMO code
            multiplier      : float — travel time penalty factor (1.0 = normal)
            rainfall_mm     : float — precipitation in mm
            wind_speed_kmh  : float — wind speed at 10m height
            visibility_m    : float — approximate visibility in metres (derived)
            is_monsoon      : bool  — Tamil Nadu monsoon season flag
            severity        : str  — "LOW" | "MEDIUM" | "HIGH"
        """
        cache_key = f"{round(lat, 2)}_{round(lng, 2)}"

        # Check cache
        import time
        if cache_key in self._cache:
            if time.time() - self._cache_time.get(cache_key, 0) < self.CACHE_TTL_SEC:
                return self._cache[cache_key]

        try:
            async with httpx.AsyncClient(timeout=6.0) as client:
                resp = await client.get(self.BASE_URL, params={
                    "latitude":  round(lat, 4),
                    "longitude": round(lng, 4),
                    "current": ",".join([
                        "weather_code",
                        "wind_speed_10m",
                        "precipitation",
                        "rain",
                        "wind_gusts_10m",
                        "cloud_cover",
                    ]),
                    "forecast_days": 1,
                    "timezone": "Asia/Kolkata"
                })
                resp.raise_for_status()
                raw = resp.json().get("current", {})

            code        = int(raw.get("weather_code", 0))
            condition, multiplier = _decode_wmo(code)
            rainfall    = float(raw.get("rain", raw.get("precipitation", 0)))
            wind        = float(raw.get("wind_speed_10m", 0))
            gusts       = float(raw.get("wind_gusts_10m", 0))

            # Visibility approximation: not directly in Open-Meteo free tier
            # We infer from cloud cover and rainfall
            cloud       = float(raw.get("cloud_cover", 0))
            visibility_m = max(200.0, 10000.0 - (cloud * 60) - (rainfall * 500))

            # Tamil Nadu monsoon bump: if monsoon season and raining, escalate multiplier
            is_monsoon = _is_monsoon_season()
            if is_monsoon and rainfall > 2.0:
                multiplier = min(multiplier * 1.1, 2.0)

            severity = self._classify_severity(multiplier, wind, rainfall)

            result = {
                "condition":     condition,
                "weather_code":  code,
                "multiplier":    round(multiplier, 3),
                "rainfall_mm":   round(rainfall, 2),
                "wind_speed_kmh": round(wind, 1),
                "wind_gusts_kmh": round(gusts, 1),
                "visibility_m":  round(visibility_m, 0),
                "is_monsoon":    is_monsoon,
                "severity":      severity,
                "lat":           lat,
                "lng":           lng,
            }

            # Store in cache
            self._cache[cache_key] = result
            self._cache_time[cache_key] = time.time()
            return result

        except httpx.TimeoutException:
            logger.warning(f"[Weather] Timeout fetching weather at ({lat},{lng}). Using safe defaults.")
        except Exception as e:
            logger.warning(f"[Weather] Failed to fetch weather at ({lat},{lng}): {e}")

        # Safe fallback — assume slight overhead for unknown conditions
        return {
            "condition":     "unknown",
            "weather_code":  0,
            "multiplier":    1.05,
            "rainfall_mm":   0.0,
            "wind_speed_kmh": 0.0,
            "wind_gusts_kmh": 0.0,
            "visibility_m":  10000.0,
            "is_monsoon":    _is_monsoon_season(),
            "severity":      "LOW",
            "lat":           lat,
            "lng":           lng,
        }

    async def get_route_weather_summary(self, stops: list[dict]) -> dict:
        """
        Fetches weather for all stops in a route and returns an aggregate summary.

        Args:
            stops: list of dicts with 'lat' and 'lng' keys

        Returns:
            worst_condition, max_multiplier, affected_stops list, overall_severity
        """
        if not stops:
            return {"max_multiplier": 1.0, "worst_condition": "clear", "severity": "LOW", "affected_stops": []}

        tasks = [
            self.get_weather(float(s.get("lat", 0)), float(s.get("lng", 0)))
            for s in stops
            if s.get("lat") and s.get("lng")
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        max_mult   = 1.0
        worst_cond = "clear"
        worst_sev  = "LOW"
        affected   = []

        for stop, weather in zip(stops, results):
            if isinstance(weather, Exception):
                continue
            mult = weather.get("multiplier", 1.0)
            if mult > max_mult:
                max_mult   = mult
                worst_cond = weather.get("condition", "clear")
                worst_sev  = weather.get("severity", "LOW")
            if mult > 1.1:
                affected.append({
                    "stop_id":   stop.get("id"),
                    "customer":  stop.get("customer", "Unknown"),
                    "condition": weather.get("condition"),
                    "multiplier": mult,
                    "severity":   weather.get("severity"),
                })

        return {
            "max_multiplier":  round(max_mult, 3),
            "worst_condition": worst_cond,
            "severity":        worst_sev,
            "affected_stops":  affected,
            "is_monsoon":      _is_monsoon_season(),
        }

    @staticmethod
    def _classify_severity(multiplier: float, wind_kmh: float, rainfall_mm: float) -> str:
        """
        LOW    → Normal driving. No significant impact.
        MEDIUM → Caution. Expect 10–40% longer ETAs.
        HIGH   → Severe. Route re-optimization recommended.
        """
        if multiplier >= 1.45 or wind_kmh >= 60 or rainfall_mm >= 20:
            return "HIGH"
        if multiplier >= 1.15 or wind_kmh >= 35 or rainfall_mm >= 5:
            return "MEDIUM"
        return "LOW"

    def get_condition_emoji(self, condition: str) -> str:
        emojis = {
            "clear": "☀️", "partly_cloudy": "⛅", "mist": "🌫️",
            "fog": "🌫️", "drizzle": "🌦️", "heavy_drizzle": "🌧️",
            "rain": "🌧️", "freezing_rain": "🌨️", "showers": "🌦️",
            "heavy_showers": "⛈️", "thunderstorm": "⛈️", "heavy_storm": "🌪️",
        }
        return emojis.get(condition, "🌡️")


# ── Module-level singleton ───────────────────────────────────────────────────────
weather_service = WeatherService()
