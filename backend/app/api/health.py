"""
USES: System monitoring and health checks.
SUPPORT: Provides an endpoint for load balancers and monitoring tools to verify the
         operational availability of the routing engine and its dependencies.
"""
from fastapi import APIRouter
import httpx

from app.ml.predictor import predictor
from app.core.config import config
from app.core.logger import logger

import redis.asyncio as redis
from sqlalchemy import text
from app.db.database import engine

router = APIRouter()

@router.get("/health")
async def health_check():
    """
    Enterprise health check verifying all core service dependencies.
    """
    # 1. ML Model status
    model_loaded = predictor.model is not None

    # 2. OSRM real ping (Using Chennai coordinates to ensure road proximity)
    osrm_ok = False
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            # Points: Marina Beach to Egmore (Chennai)
            resp = await client.get(f"{config.OSRM_URL}/route/v1/driving/80.2827,13.0489;80.2585,13.0792?overview=false")
            osrm_ok = resp.status_code == 200
            if not osrm_ok:
                logger.warning(f"OSRM health check returned status {resp.status_code}: {resp.text}")
    except Exception as e:
        logger.warning(f"OSRM health ping failed: {type(e).__name__} - {str(e)}")
        osrm_ok = False

    # 3. Redis Cache Availability
    redis_ok = False
    try:
        r = redis.from_url(config.REDIS_URL)
        redis_ok = await r.ping()
    except Exception as e:
        logger.warning(f"Redis health check failed: {e}")
        redis_ok = False

    # 4. Database Persistence Connectivity
    db_ok = False
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
            db_ok = True
    except Exception as e:
        logger.warning(f"Database health check failed: {e}")
        db_ok = False

    overall = "ok" if (model_loaded and osrm_ok and redis_ok and db_ok) else "degraded"

    return {
        "status": overall,
        "dependencies": {
            "ml_model": "loaded" if model_loaded else "critical_failure",
            "osrm_router": "reachable" if osrm_ok else "unreachable",
            "redis_cache": "connected" if redis_ok else "unreachable",
            "database": "connected" if db_ok else "disconnected"
        },
        "version": "1.0.0-PROD"
    }
