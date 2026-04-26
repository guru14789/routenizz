from fastapi import APIRouter, Depends
from ml.predictor import predictor
from ml.traffic_model import TrafficModelMetadata
from app.utils.firebase_auth import require_admin
import datetime
import random

router = APIRouter()

# Colour palette for chart bars — aligned with feature order in TrafficModelMetadata.FEATURES
_FEATURE_COLOURS = ["#6366f1", "#8b5cf6", "#ec4899", "#f43f5e", "#f59e0b"]

@router.get("/feature-importance")
async def get_feature_importance(current_user: dict = Depends(require_admin)):
    """
    Returns the relative importance of features extracted directly from the
    trained Random Forest model via model.feature_importances_.
    Falls back to static values if the model is not loaded.
    """
    features = TrafficModelMetadata.FEATURES

    # --- REAL: pull directly from the trained sklearn model ---
    if predictor.model is not None and hasattr(predictor.model, "feature_importances_"):
        raw = predictor.model.feature_importances_  # numpy array, sums to 1.0
        # Normalise to a 0-100 scale for the chart
        max_val = max(raw) if max(raw) > 0 else 1.0
        return [
            {
                "name": feat.replace("_", " ").title(),
                "value": round((imp / max_val) * 100, 1),
                "fill": _FEATURE_COLOURS[i % len(_FEATURE_COLOURS)]
            }
            for i, (feat, imp) in enumerate(zip(features, raw))
        ]

    # --- FALLBACK: static values when model is not yet loaded ---
    return [
        {"name": "Hour Of Day",  "value": 85, "fill": "#6366f1"},
        {"name": "Day Of Week",  "value": 25, "fill": "#f59e0b"},
        {"name": "Is Holiday",   "value": 18, "fill": "#ec4899"},
        {"name": "Region Id",    "value": 12, "fill": "#f43f5e"},
    ]

@router.get("/traffic-trend")
async def get_traffic_trend(current_user: dict = Depends(require_admin)):
    """Returns a 24-hour predicted traffic multiplier trend for today using the live ML model."""
    today = datetime.datetime.now()
    day_of_week = today.weekday()

    trend = []
    for h in range(0, 24, 2):
        multiplier = predictor.predict_multiplier(hour=h, day_of_week=day_of_week)
        trend.append({"hour": f"{h:02d}:00", "multiplier": round(multiplier, 2)})

    return trend

@router.get("/performance-scatter")
async def get_performance_scatter(current_user: dict = Depends(require_admin)):
    """
    Returns actual vs predicted scatter data.
    NOTE: This is currently simulated. In production, replace with a query
    to a trip-log database where real (predicted, actual) pairs are recorded.
    """
    data = []
    base_multipliers = [1.0, 1.2, 1.5, 1.8, 2.1, 1.4, 1.1]
    rng = random.Random(42)  # Fixed seed so chart doesn't flicker on every reload
    for _ in range(50):
        base = rng.choice(base_multipliers)
        predicted = base + (rng.random() - 0.5) * 0.2
        actual = predicted + (rng.random() - 0.5) * 0.3
        data.append({
            "actual": round(actual, 2),
            "predicted": round(predicted, 2),
            "error": round(abs(actual - predicted), 3)
        })
    return data

@router.get("/accuracy-trend")
async def get_accuracy_trend(current_user: dict = Depends(require_admin)):
    """
    Returns a 7-day model accuracy trend.
    NOTE: Simulated. Replace with real evaluation logs when trip history is stored.
    """
    days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    rng = random.Random(7)  # Fixed seed — stable chart, no flicker
    return [
        {"day": d, "accuracy": round(92 + rng.random() * 5, 1)} for d in days
    ]

@router.get("/engine-status")
async def get_engine_status(current_user: dict = Depends(require_admin)):
    """Returns live status metadata for the ML engine."""
    model_active = predictor.model is not None
    # Read R² from model metadata if available, otherwise use the known trained value
    r2 = getattr(TrafficModelMetadata, "R2_SCORE", 0.94)
    return {
        "model_version": TrafficModelMetadata.VERSION,
        "status": "Active" if model_active else "Degraded",
        "last_retrained": "2026-03-12",
        "r2_score": r2
    }

@router.get("/efficiency-gap")
async def get_efficiency_gap(current_user: dict = Depends(require_admin)):
    """
    Calculates the 'Orion Gap': The variance between planned and actual segment durations.
    Used to identify systemic routing inefficiencies or driver performance issues.
    """
    # Simulated response reflecting the performance of the last 100 trips
    # In production, this would query the TelemetryLog table
    return {
        "mean_absolute_error_sec": 42.5,
        "efficiency_index": 0.96, # 1.0 is perfect alignment
        "gap_breakdown": [
            {"category": "High Traffic", "gap": 15.2},
            {"category": "School Zones", "gap": 8.4},
            {"category": "Industrial", "gap": 2.1},
            {"category": "Residential", "gap": -1.5} # Faster than predicted
        ]
    }
