import redis.asyncio as redis
from app.config import config
from app.utils.logger import logger

class RedisClient:
    _instance = None

    def __init__(self):
        self.client = redis.from_url(config.REDIS_URL, decode_responses=True)

    @classmethod
    def get_instance(cls):
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    async def get(self, key):
        try:
            return await self.client.get(key)
        except Exception as e:
            logger.error(f"Redis GET failed for {key}: {e}")
            return None

    async def set(self, key, value, ex=3600):
        try:
            await self.client.set(key, value, ex=ex)
            return True
        except Exception as e:
            logger.error(f"Redis SET failed for {key}: {e}")
            return False

    async def delete(self, key):
        try:
            await self.client.delete(key)
            return True
        except Exception as e:
            logger.error(f"Redis DEL failed for {key}: {e}")
            return False

redis_client = RedisClient.get_instance()
