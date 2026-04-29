from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.database import async_session
from app.models.db_models import ModelMetrics
from app.core.logger import logger

/**
 * ORION-ELITE MLOps Module
 * Handles tracking of model performance in production to detect drift.
 */

async def log_prediction_error(predicted: float, actual: float, metadata: dict = None):
    """
    Logs each prediction and its actual outcome for model performance monitoring.
    Calculates error percentage and stores contextual metadata (weather, time).
    """
    if actual <= 0:
        return

    error_pct = abs(predicted - actual) / actual * 100
    now = datetime.utcnow()
    
    metadata = metadata or {}
    
    try:
        async with async_session() as session:
            metric = ModelMetrics(
                predicted_time_min=predicted,
                actual_time_min=actual,
                error_pct=error_pct,
                segment_id=metadata.get("segment_id"),
                weather_condition=metadata.get("weather", "clear"),
                hour_of_day=now.hour,
                day_of_week=now.weekday(),
                timestamp=now
            )
            session.add(metric)
            await session.commit()
            
            if error_pct > 25:
                logger.warning(f"[MLOPS] High prediction error detected: {error_pct:.2f}% (Pred: {predicted:.1f}, Act: {actual:.1f})")
                
    except Exception as e:
        logger.error(f"[MLOPS] Failed to log model metric: {e}")

async def get_model_health():
    """
    Returns aggregate performance metrics for the ML model health dashboard.
    """
    from sqlalchemy import select, func
    try:
        async with async_session() as session:
            # Average error in the last 24 hours
            one_day_ago = datetime.utcnow().replace(hour=0, minute=0, second=0)
            q = select(func.avg(ModelMetrics.error_pct)).where(ModelMetrics.timestamp >= one_day_ago)
            result = await session.execute(q)
            avg_error = result.scalar() or 0.0
            
            return {
                "avg_error_pct_24h": round(avg_error, 2),
                "status": "healthy" if avg_error < 15 else "degraded" if avg_error < 25 else "critical",
                "last_check": datetime.utcnow().isoformat()
            }
    except Exception as e:
        logger.error(f"[MLOPS] Health check failed: {e}")
        return {"status": "unknown", "error": str(e)}
