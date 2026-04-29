from app.core.logger import logger
from app.db.redis_client import redis_client
import time
import json

class RealTimeRouter:
    """
    Handles live vehicle telemetry stored in Redis (TTL: 24h).
    """
    async def update_vehicle_position(self, vehicle_id: str, lat: float, lng: float, timestamp: float = None):
        """
        Updates live vehicle telemetry in Redis for re-optimization triggers.
        """
        if timestamp is None:
            timestamp = time.time()
            
        data = {
            "lat": lat,
            "lng": lng,
            "last_seen": timestamp
        }
        
        # Save to Redis with 24-hour expiration
        success = await redis_client.set(f"fleet:{vehicle_id}:telemetry", json.dumps(data), ex=86400)
        
        if success:
            logger.info(f"Production Telemetry: Vehicle {vehicle_id} updated in Redis.")
            return {"status": "success", "vehicle_id": vehicle_id, "timestamp": timestamp}
        else:
            logger.error(f"Failed to update vehicle {vehicle_id} in Redis.")
            return {"status": "error", "message": "Cache write failed"}

    async def get_vehicle_position(self, vehicle_id: str):
        """
        Retrieves the last known position from Redis.
        """
        raw_data = await redis_client.get(f"fleet:{vehicle_id}:telemetry")
        if raw_data:
            return json.loads(raw_data)
        return None

    def check_for_traffic_spike(self, route_summary: dict):
        """
        Stub for complex deviation/spike detection.
        """
        return False

realtime_router = RealTimeRouter()
