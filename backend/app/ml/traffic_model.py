"""
USES: Machine Learning model metadata and schema definitions.
SUPPORT: Ensures consistency between training and inference phases by defining expected features and training versioning.
"""

class TrafficModelMetadata:  # Static metadata class for the traffic prediction engine
    VERSION: str = "2.1.0"  # Current production version of the LightGBM/RandomForest model
    
    # The exact list and order of columns used during the Scikit-Learn training phase
    FEATURES: list = ['hour', 'day_of_week', 'is_holiday', 'region_id'] 

    # Operational guardrails for predicted multipliers
    CLIP_MIN: float = 1.0  # Constraint: Efficiency cannot exceed free-flow speed (multiplier >= 1)
    CLIP_MAX: float = 3.5  # Constraint: Congestion cost is capped at 350% overhead for numerical stability
