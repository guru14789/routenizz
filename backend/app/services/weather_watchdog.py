"""
TNImpact Weather Watchdog — ORION Strategy 4
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
A background async service that monitors active fleet routes for deteriorating
weather conditions and triggers the existing Delta Re-Optimization engine.

Architecture:
  - Polls weather every POLL_INTERVAL_SEC (default 10 min) for all active route stops
  - On HIGH severity: triggers vrp_solver.solve_vrp_delta() for the affected vehicle
  - Publishes reroute alerts to Firebase Firestore for the driver mobile app
  - Respects a 15-minute cooldown per vehicle to prevent thrashing
"""
import asyncio
from datetime import datetime, timedelta
from app.core.logger import logger
from app.services.weather_service import weather_service


POLL_INTERVAL_SEC = 600       # 10 minutes between checks
REROUTE_COOLDOWN_MIN = 15     # Minimum minutes between consecutive reroutes per vehicle


class WeatherWatchdog:
    """
    Monitors active routes in real-time and triggers weather-aware Delta Re-Optimization.

    Integration with existing architecture:
        - solve_vrp_delta() in vrp_solver.py handles the actual re-optimization
        - Firebase Firestore receives the new route for mobile driver updates
        - Anti-flapping: per-vehicle cooldown prevents excessive solver calls
    """

    def __init__(self):
        self._running = False
        self._task: asyncio.Task | None = None
        # Track last reroute time per vehicle: {vehicle_id: datetime}
        self._last_reroute: dict[str, datetime] = {}

    async def start(self):
        """Starts the watchdog background loop. Called from main.py lifespan."""
        self._running = True
        logger.info("[WeatherWatchdog] 🌦️  Service started. Monitoring active routes for adverse weather.")
        while self._running:
            try:
                await self._check_all_active_routes()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"[WeatherWatchdog] Unexpected error in monitoring loop: {e}")
            await asyncio.sleep(POLL_INTERVAL_SEC)

    async def stop(self):
        """Graceful shutdown — called during app lifespan teardown."""
        self._running = False
        if self._task and not self._task.done():
            self._task.cancel()
        logger.info("[WeatherWatchdog] Service stopped.")

    async def _check_all_active_routes(self):
        """
        Fetches all active routes from the Re-Optimization Service registry
        and evaluates weather along each route.
        """
        try:
            from app.services.reopt_service import reopt_service
            active_routes = reopt_service.get_active_routes()  # Returns {vehicle_id: route_data}

            if not active_routes:
                return

            logger.info(f"[WeatherWatchdog] Checking weather for {len(active_routes)} active vehicles.")

            for vehicle_id, route_data in active_routes.items():
                stops = route_data.get("stops", [])
                if not stops:
                    continue

                # Skip stops that are already completed
                pending_stops = [s for s in stops if s.get("status") not in ("Delivered", "Depot")]

                if len(pending_stops) < 2:
                    continue

                await self._evaluate_vehicle_weather(vehicle_id, route_data, pending_stops)

        except AttributeError:
            # reopt_service may not have get_active_routes — gracefully skip
            logger.debug("[WeatherWatchdog] reopt_service.get_active_routes not available yet.")
        except Exception as e:
            logger.error(f"[WeatherWatchdog] Error during route check cycle: {e}")

    async def _evaluate_vehicle_weather(self, vehicle_id: str, route_data: dict, pending_stops: list):
        """
        Evaluates weather severity along a vehicle's remaining route.
        Triggers re-optimization if HIGH severity is detected.
        """
        summary = await weather_service.get_route_weather_summary(pending_stops)
        severity = summary.get("severity", "LOW")
        condition = summary.get("worst_condition", "clear")
        multiplier = summary.get("max_multiplier", 1.0)

        if severity == "HIGH":
            logger.warning(
                f"[WeatherWatchdog] ⛈️  HIGH severity detected for vehicle {vehicle_id}. "
                f"Condition: {condition} (×{multiplier:.2f} travel time). "
                f"Evaluating Delta Re-Optimization..."
            )
            await self._trigger_reroute(vehicle_id, route_data, summary)

        elif severity == "MEDIUM":
            logger.info(
                f"[WeatherWatchdog] 🌧️  MEDIUM weather on vehicle {vehicle_id}'s route "
                f"({condition}, ×{multiplier:.2f}). ETA adjustments applied — no reroute needed."
            )
            # Soft alert: push ETA update to Firestore without full reroute
            await self._push_eta_update(vehicle_id, multiplier, condition)

    async def _trigger_reroute(self, vehicle_id: str, route_data: dict, weather_summary: dict):
        """
        Calls vrp_solver.solve_vrp_delta() and pushes the new plan to Firebase.
        Respects the per-vehicle cooldown window.
        """
        # ── Anti-flapping cooldown check ────────────────────────────────────────
        last = self._last_reroute.get(vehicle_id)
        if last and (datetime.now() - last) < timedelta(minutes=REROUTE_COOLDOWN_MIN):
            remaining = REROUTE_COOLDOWN_MIN - (datetime.now() - last).seconds // 60
            logger.info(
                f"[WeatherWatchdog] Vehicle {vehicle_id} in cooldown. "
                f"Next reroute allowed in ~{remaining} min."
            )
            return

        try:
            from app.engine.vrp_solver import vrp_solver

            office         = route_data.get("office", {})
            vehicles       = route_data.get("vehicles", [])
            stops          = route_data.get("stops", [])
            current_state  = route_data.get("current_state", {})

            if not office or not vehicles or not stops:
                logger.warning(f"[WeatherWatchdog] Incomplete route data for vehicle {vehicle_id}. Skipping reroute.")
                return

            logger.info(f"[WeatherWatchdog] 🔄 Triggering Delta Re-Optimization for vehicle {vehicle_id}...")
            new_plan = await vrp_solver.solve_vrp_delta(office, vehicles, stops, current_state)

            self._last_reroute[vehicle_id] = datetime.now()

            # ── Push to Firebase so mobile driver app gets the update ────────────
            await self._push_reroute_to_firebase(vehicle_id, new_plan, weather_summary)

            logger.info(
                f"[WeatherWatchdog] ✅ Vehicle {vehicle_id} successfully rerouted. "
                f"Reason: {weather_summary.get('worst_condition')} weather detected."
            )

        except Exception as e:
            logger.error(f"[WeatherWatchdog] Reroute failed for vehicle {vehicle_id}: {e}")

    async def _push_reroute_to_firebase(self, vehicle_id: str, new_plan: dict, weather_summary: dict):
        """Syncs the updated route and weather alert to Firestore."""
        try:
            from app.services.firebase_db_service import firebase_db_service
            from app.db.firebase import get_firestore_db

            db = get_firestore_db()
            if not db:
                return

            condition = weather_summary.get("worst_condition", "unknown")
            emoji = weather_service.get_condition_emoji(condition)
            mult = weather_summary.get("max_multiplier", 1.0)
            extra_pct = int((mult - 1.0) * 100)

            new_routes = new_plan.get("routes", [])
            vehicle_route = next((r for r in new_routes if str(r.get("vehicle_id")) == str(vehicle_id)), None)

            if vehicle_route:
                new_stops = [s.dict() if hasattr(s, 'dict') else s for s in vehicle_route.get("stops", [])]
                await firebase_db_service.sync_route_to_firebase(vehicle_id, new_stops)

            # Write alert notification
            db.collection("weather_alerts").add({
                "vehicle_id":    vehicle_id,
                "condition":     condition,
                "severity":      weather_summary.get("severity"),
                "multiplier":    mult,
                "message":       f"{emoji} Route updated due to {condition}. ETA +{extra_pct}% adjustment applied.",
                "affected_stops": weather_summary.get("affected_stops", []),
                "timestamp":     datetime.utcnow(),
                "resolved":      False,
            })

        except Exception as e:
            logger.error(f"[WeatherWatchdog] Firebase push failed for vehicle {vehicle_id}: {e}")

    async def _push_eta_update(self, vehicle_id: str, multiplier: float, condition: str):
        """Pushes a soft ETA warning to Firestore without triggering a full reroute."""
        try:
            from app.db.firebase import get_firestore_db
            db = get_firestore_db()
            if not db:
                return

            extra_pct = int((multiplier - 1.0) * 100)
            emoji = weather_service.get_condition_emoji(condition)

            db.collection("weather_alerts").add({
                "vehicle_id": vehicle_id,
                "condition":  condition,
                "severity":   "MEDIUM",
                "multiplier": multiplier,
                "message":    f"{emoji} {condition.replace('_', ' ').title()} detected. ETA may increase by ~{extra_pct}%.",
                "timestamp":  datetime.utcnow(),
                "resolved":   False,
                "type":       "eta_warning",
            })
        except Exception as e:
            logger.debug(f"[WeatherWatchdog] ETA update push skipped: {e}")


# ── Module-level singleton ────────────────────────────────────────────────────────
weather_watchdog = WeatherWatchdog()
