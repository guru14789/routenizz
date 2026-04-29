"""
ORION-ELITE: OSRM Traffic Monitor
Polls OSRM for matrix drift every 5 minutes.
If drift > 15%, publishes to Redis 'traffic_update' channel.
"""
import asyncio
import json
import time
import hashlib
from typing import List, Dict, Optional
import httpx
import redis.asyncio as aioredis

from app.core.config import config
from app.core.logger import logger

TRAFFIC_CHANNEL = "traffic_update"


class OSRMTrafficMonitor:
    """
    ORION-ELITE IMPROVEMENT #7: Live traffic integration.
    Detects when road conditions change significantly and triggers re-optimization.
    """

    def __init__(self):
        self.redis = aioredis.from_url(config.REDIS_URL, decode_responses=True)
        self.osrm_url = config.OSRM_URL
        self.poll_interval_sec = 300  # 5 minutes
        self.drift_threshold_pct = 15.0
        self.last_matrix: Optional[List[List[int]]] = None
        self.last_coords_hash: Optional[str] = None
        self.running = False

    async def start(self, get_active_coords_fn):
        """
        Starts the polling loop.
        `get_active_coords_fn` is an async callable that returns current stop coordinates.
        """
        self.running = True
        logger.info("[TRAFFIC] OSRM traffic monitor started.")

        while self.running:
            try:
                await asyncio.sleep(self.poll_interval_sec)
                coords = await get_active_coords_fn()
                if coords and len(coords) >= 2:
                    await self._check_matrix_drift(coords)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"[TRAFFIC] Monitor error: {e}")

    async def _check_matrix_drift(self, coordinates: List[List[float]]):
        """Fetches a new OSRM matrix and compares it against the last known matrix."""
        coord_str = ";".join([f"{c[1]},{c[0]}" for c in coordinates])
        coords_hash = hashlib.md5(coord_str.encode()).hexdigest()

        if coords_hash != self.last_coords_hash:
            # Coordinates changed (new stops) — reset baseline
            self.last_matrix = None
            self.last_coords_hash = coords_hash
            logger.info("[TRAFFIC] Coordinate set changed — resetting matrix baseline.")

        new_matrix = await self._fetch_matrix(coord_str)
        if not new_matrix:
            return

        if self.last_matrix is None:
            self.last_matrix = new_matrix
            logger.info("[TRAFFIC] Baseline matrix established.")
            return

        drift_pct, affected_segments = self._calculate_drift(self.last_matrix, new_matrix)
        logger.info(f"[TRAFFIC] Matrix drift: {drift_pct:.1f}%")

        if drift_pct >= self.drift_threshold_pct:
            logger.warning(f"[TRAFFIC] 🚨 Drift {drift_pct:.1f}% exceeds threshold. Publishing re-opt trigger.")
            await self._publish_traffic_event(drift_pct, affected_segments)
            self.last_matrix = new_matrix  # Update baseline after publishing

    async def _fetch_matrix(self, coord_str: str) -> Optional[List[List[int]]]:
        """Fetches duration matrix from OSRM."""
        url = f"{self.osrm_url}/table/v1/driving/{coord_str}?annotations=duration"
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(url)
                if resp.status_code == 200:
                    data = resp.json()
                    return data.get("durations")
        except Exception as e:
            logger.error(f"[TRAFFIC] OSRM fetch failed: {e}")
        return None

    def _calculate_drift(
        self,
        old_matrix: List[List],
        new_matrix: List[List]
    ) -> tuple:
        """
        Computes the percentage change in travel times between two matrices.
        Returns overall drift % and list of affected segments.
        """
        total_entries = 0
        drifted_entries = 0
        total_drift_sum = 0.0
        affected_segments = []

        for i in range(min(len(old_matrix), len(new_matrix))):
            for j in range(min(len(old_matrix[i]), len(new_matrix[i]))):
                if i == j:
                    continue
                old_t = old_matrix[i][j] or 1
                new_t = new_matrix[i][j] or 1
                pct = abs(new_t - old_t) / old_t * 100
                total_drift_sum += pct
                total_entries += 1
                if pct >= self.drift_threshold_pct:
                    drifted_entries += 1
                    affected_segments.append({
                        "from_idx": i,
                        "to_idx": j,
                        "old_sec": old_t,
                        "new_sec": new_t,
                        "drift_pct": round(pct, 1)
                    })

        avg_drift = total_drift_sum / total_entries if total_entries > 0 else 0
        return round(avg_drift, 2), affected_segments

    async def _publish_traffic_event(self, drift_pct: float, affected_segments: list):
        """Publishes traffic drift event to Redis for the Re-Opt service to consume."""
        payload = {
            "event": "traffic_update",
            "drift_percent": drift_pct,
            "affected_segments": affected_segments[:20],  # cap for Redis payload size
            "timestamp": time.time()
        }
        await self.redis.publish(TRAFFIC_CHANNEL, json.dumps(payload))

    async def stop(self):
        self.running = False
        await self.redis.aclose()


traffic_monitor = OSRMTrafficMonitor()
