"""
USES: System monitoring and health checks.
SUPPORT: Provides an endpoint for load balancers and monitoring tools to verify the
         operational availability of the routing engine and its dependencies.
"""
from fastapi import APIRouter
import httpx

from ml.predictor import predictor
from app.config import config
from app.utils.logger import logger

router = APIRouter()

@router.get("/health")
async def health_check():
    """
    Real dependency health check for monitoring agents (e.g., Kubernetes probes).
    Checks: ML model load status + live OSRM reachability ping.
    """
    # 1. ML Model status
    model_loaded = predictor.model is not None

    # 2. OSRM real ping — 2-second timeout to avoid blocking the health route
    osrm_ok = False
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            resp = await client.get(f"{config.OSRM_URL}/route/v1/driving/0,0;1,1?overview=false")
            osrm_ok = resp.status_code == 200
    except Exception as e:
        logger.warning(f"OSRM health ping failed: {e}")
        osrm_ok = False

    overall = "ok" if (model_loaded and osrm_ok) else "degraded"

    return {
        "status": overall,
        "model_loaded": model_loaded,
        "osrm_reachable": osrm_ok,
    }
