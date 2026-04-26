import httpx
import hashlib
import json
import redis.asyncio as redis
from app.config import config
from app.utils.logger import logger

class MatrixBuilder:
    def __init__(self):
        self.base_url = f"{config.OSRM_URL}/table/v1/driving"
        self.redis = redis.from_url(config.REDIS_URL, decode_responses=True)

    async def get_duration_matrix(self, coordinates: list):
        """
        Fetches an NxN duration matrix from OSRM, with Redis caching for performance.
        """
        coord_string = ";".join([f"{c[1]},{c[0]}" for c in coordinates])
        
        # Performance Optimization: Redis Cache Check
        cache_key = f"matrix:{hashlib.md5(coord_string.encode()).hexdigest()}"
        try:
            cached_data = await self.redis.get(cache_key)
            if cached_data:
                logger.info(f"Matrix Cache Hit: {cache_key}")
                return json.loads(cached_data)
        except Exception as re:
            logger.warning(f"Redis Cache inaccessible: {re}")

        url = f"{self.base_url}/{coord_string}?annotations=duration"

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(url)
                
                if response.status_code != 200:
                    logger.error(f"OSRM Error: {response.text}")
                    return None

                data = response.json()
                durations = data.get("durations")
                
                # Update Cache for future requests (Expire in 24 hours)
                if durations:
                    try:
                        await self.redis.setex(cache_key, 86400, json.dumps(durations))
                    except Exception as re:
                        logger.warning(f"Failed to update cache: {re}")
                        
                return durations
        except Exception as e:
            logger.error(f"Matrix build exception for {len(coordinates)} nodes: {e}")
            return None

matrix_builder = MatrixBuilder()
  # Export a singleton for app-wide use
