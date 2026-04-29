"""
ORION-ELITE IMPROVEMENT #1 + #2: Event-Driven Re-Optimization Service
- Listens to Redis pub/sub for live events
- Performs INCREMENTAL re-optimization (only affected routes)
- Never disrupts drivers mid-stop
"""
import asyncio
import json
import time
import redis.asyncio as aioredis
from app.core.config import config
from app.core.logger import logger


REOPT_CHANNEL = "reopt_trigger"
ROUTE_UPDATE_CHANNEL = "route_updated"
TRAFFIC_CHANNEL = "traffic_update"
ORDER_CHANNEL = "new_order"
DRIVER_CHANNEL = "driver_update"


class ReOptimizationService:
    """
    ORION-ELITE IMPROVEMENT #1: Dynamic, event-driven re-optimization.
    Subscribes to Redis channels and triggers incremental solver runs.
    """

    def __init__(self):
        self.redis = aioredis.from_url(config.REDIS_URL, decode_responses=True)
        self.active_routes_cache_key = "active:routes"
        self.running = False

    async def start(self):
        """Main event loop — subscribes to all relevant Redis channels."""
        self.running = True
        logger.info("[REOPT] Re-optimization service started. Listening for events...")
        pubsub = self.redis.pubsub()
        await pubsub.subscribe(TRAFFIC_CHANNEL, ORDER_CHANNEL, DRIVER_CHANNEL, REOPT_CHANNEL)

        async for message in pubsub.listen():
            if not self.running:
                break
            if message["type"] != "message":
                continue
            await self._dispatch_event(message["channel"], message["data"])

    async def _dispatch_event(self, channel: str, raw_data: str):
        """Routes incoming events to the appropriate handler."""
        try:
            data = json.loads(raw_data)
        except Exception:
            data = {"raw": raw_data}

        logger.info(f"[REOPT] Event on '{channel}': {str(data)[:120]}")

        if channel == TRAFFIC_CHANNEL:
            await self._handle_traffic_update(data)
        elif channel == ORDER_CHANNEL:
            await self._handle_new_order(data)
        elif channel == DRIVER_CHANNEL:
            await self._handle_driver_update(data)
        elif channel == REOPT_CHANNEL:
            await self._handle_reopt_trigger(data)

    async def _handle_traffic_update(self, data: dict):
        """
        ORION-ELITE: Triggered when OSRM matrix drift > 15%.
        Performs delta re-optimization only for routes with affected segments.
        """
        drift_pct = data.get("drift_percent", 0)
        affected_segments = data.get("affected_segments", [])

        if drift_pct < 15:
            logger.info(f"[REOPT] Traffic drift {drift_pct}% below threshold. No action.")
            return

        logger.warning(f"[REOPT] 🚨 Traffic drift {drift_pct}% detected. Triggering incremental re-opt.")

        # Fetch active routes from cache
        active_routes_json = await self.redis.get(self.active_routes_cache_key)
        if not active_routes_json:
            logger.info("[REOPT] No active routes in cache. Skipping.")
            return

        active_routes = json.loads(active_routes_json)

        # Find which vehicles have stops in affected segments
        affected_vehicles = []
        for route in active_routes.get("routes", []):
            stops = route.get("stops", [])
            if any(self._stop_in_affected_zone(s, affected_segments) for s in stops):
                affected_vehicles.append(route["vehicle_id"])

        if not affected_vehicles:
            logger.info("[REOPT] No vehicles affected by traffic event.")
            return

        # Trigger incremental solve via task queue
        await self._trigger_incremental_solve(
            vehicle_ids=affected_vehicles,
            trigger="traffic_update",
            drift_percent=drift_pct
        )

    async def _handle_new_order(self, data: dict):
        """
        ORION-ELITE: New order injected mid-route.
        Finds the best vehicle to absorb it without disrupting current deliveries.
        """
        new_stop = data.get("stop", {})
        logger.info(f"[REOPT] New order received: {new_stop.get('id', 'unknown')}")

        # Trigger incremental solve — only adds to cheapest insertion point
        await self._trigger_incremental_solve(
            vehicle_ids="all",
            trigger="new_order",
            new_stop=new_stop
        )

    async def _handle_driver_update(self, data: dict):
        """
        Handles driver delay reports and segment feedback (Intent Learning).
        """
        event_type = data.get("type")
        vehicle_id = data.get("vehicle_id")

        if event_type == "delay_reported":
            delay_min = data.get("delay_min", 10)
            logger.warning(f"[REOPT] Driver {vehicle_id} reported {delay_min}min delay.")
            await self._trigger_incremental_solve(
                vehicle_ids=[vehicle_id],
                trigger="driver_delay"
            )

        elif event_type == "segment_avoided":
            # Learn from driver intent
            from_node = data.get("from_node")
            to_node = data.get("to_node")
            await self._record_driver_intent(vehicle_id, from_node, to_node)

    async def _handle_reopt_trigger(self, data: dict):
        """Manual trigger from the admin dashboard."""
        logger.info("[REOPT] Manual re-optimization triggered by dispatcher.")
        await self._trigger_incremental_solve(vehicle_ids="all", trigger="manual")

    async def _trigger_incremental_solve(
        self,
        vehicle_ids,
        trigger: str,
        **kwargs
    ):
        """
        Publishes a solve task to the Celery queue for async execution.
        Publishes result back to Redis when complete.
        """
        from app.celery_worker import celery_app

        task_payload = {
            "vehicle_ids": vehicle_ids,
            "trigger": trigger,
            "timestamp": time.time(),
            **kwargs
        }

        # Use Celery to run async without blocking the event loop
        task = celery_app.send_task(
            "app.celery_worker.run_incremental_reoptimization",
            args=[task_payload]
        )
        logger.info(f"[REOPT] Incremental solve task dispatched: {task.id} | trigger={trigger}")

    async def _record_driver_intent(self, vehicle_id: str, from_node: str, to_node: str):
        """Stores driver segment avoidance in Redis for VRP solver consumption."""
        intent_key = f"intent:{vehicle_id}"
        segment = f"{from_node}-{to_node}"
        await self.redis.sadd(intent_key, segment)
        await self.redis.expire(intent_key, 86400 * 7)  # 7-day rolling window
        logger.info(f"[INTENT] Learned: Vehicle {vehicle_id} avoids segment {segment}")

    @staticmethod
    def _stop_in_affected_zone(stop: dict, affected_segments: list) -> bool:
        """Checks if a stop's coordinates fall within affected traffic segments."""
        lat = stop.get("lat", 0)
        lng = stop.get("lng", 0)
        for seg in affected_segments:
            if (seg.get("lat_min", 0) <= lat <= seg.get("lat_max", 90) and
                    seg.get("lng_min", 0) <= lng <= seg.get("lng_max", 90)):
                return True
        return False

    async def publish_route_update(self, updated_routes: dict):
        """Broadcasts updated routes to all connected frontend clients."""
        await self.redis.publish(
            ROUTE_UPDATE_CHANNEL,
            json.dumps(updated_routes)
        )
        logger.info("[REOPT] Route update published to frontend.")

    async def get_active_routes(self) -> dict:
        """
        Retrieves currently active routes from Redis cache.
        Used by the Weather Watchdog to evaluate conditions along paths.
        """
        active_json = await self.redis.get(self.active_routes_cache_key)
        if not active_json:
            return {}
        try:
            return json.loads(active_json)
        except Exception as e:
            logger.error(f"[REOPT] Failed to parse active routes from cache: {e}")
            return {}

    async def stop(self):
        self.running = False
        await self.redis.aclose()


reopt_service = ReOptimizationService()
