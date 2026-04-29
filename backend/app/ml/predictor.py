"""
USES: Inference engine for Traffic Prediction.
SUPPORT: Loads the trained Random Forest model and predicts traffic multipliers (congestion factors) for specific time/location contexts.
"""
import joblib  # Library for loading serialized Python objects (the trained model)
import pandas as pd  # Library for structured data manipulation needed for model input
import os  # Standard library for path manipulation and file system checks
from app.core.config import config  # Import system-wide configuration for model file paths
from app.core.logger import logger  # Import logging for surfacing model loading or inference errors
from app.ml.traffic_model import TrafficModelMetadata  # Metadata defining expected features and version

class TrafficPredictor:  # Main class for traffic inference operations
    def __init__(self):  # Constructor for the predictor
        self.model = None  # Initialize model placeholder as null
        self.model_path = config.MODEL_PATH  # Get path to the saved .joblib model from config
        self._load_model()  # Attempt to load the model into memory upon instantiation

    def _load_model(self):  # Private method to handle model loading
        try:
            if os.path.exists(self.model_path):  # Check if the model file exists on disk
                self.model = joblib.load(self.model_path)  # Load the Random Forest model using joblib
                logger.info(f"Traffic Model loaded successfully from {self.model_path}")  # Log success
            else:
                logger.warning(f"Model file not found at {self.model_path}. Using fallback values.")  # Log warning
        except Exception as e:
            logger.error(f"Failed to load traffic model: {e}")  # Log any deserialization or file access errors

    def predict_multiplier(
        self,
        hour: int,
        day_of_week: int,
        is_holiday: bool = False,
        region_id: int = 1,
        weather_data: dict | None = None
    ):
        """
        Predicts traffic multiplier based on time, region, and optional weather features.

        Args:
            hour:         Hour of day (0-23)
            day_of_week:  Day of week (0=Monday … 6=Sunday)
            is_holiday:   Whether the day is a public holiday
            region_id:    Geographic region identifier (default 1 = Chennai metro)
            weather_data: Optional dict from WeatherService.get_weather() containing:
                          'multiplier'     : float — weather speed penalty (1.0 = clear)
                          'rainfall_mm'    : float — precipitation in mm
                          'wind_speed_kmh' : float — wind speed at 10m
                          'visibility_m'   : float — approximate visibility in metres
        """
        if self.model is None:  # Model not loaded — return safe overhead
            base = 1.1
        else:
            try:
                # Step 1: Build the feature vector in the exact shape the model expects
                features = pd.DataFrame([{
                    'hour': hour,
                    'day_of_week': day_of_week,
                    'is_holiday': int(is_holiday),
                    'region_id': region_id  # Now configurable — not hardcoded to 1
                }])

                # Step 2: Reorder columns to match training-time feature order
                features = features[TrafficModelMetadata.FEATURES]

                # Step 3: Run inference
                prediction = self.model.predict(features)[0]

                # Step 4: Clip to valid range [CLIP_MIN, CLIP_MAX]
                base = float(max(TrafficModelMetadata.CLIP_MIN, min(prediction, TrafficModelMetadata.CLIP_MAX)))

            except Exception as e:
                logger.error(f"Traffic prediction error: {e}")
                base = 1.2  # Conservative fallback on any runtime error

        # ── STRATEGY 3: Weather Feature Augmentation ─────────────────────────
        # Apply weather penalty ON TOP of ML prediction as a physics-based multiplier.
        # This gives immediate weather sensitivity without needing model retraining.
        # When the model is eventually retrained with weather features, this block
        # can be removed and weather will be handled natively by the RF model.
        if weather_data:
            w_mult      = float(weather_data.get("multiplier", 1.0))
            rainfall    = float(weather_data.get("rainfall_mm", 0))
            wind        = float(weather_data.get("wind_speed_kmh", 0))
            visibility  = float(weather_data.get("visibility_m", 10000))

            # Additive adjustment: weather worsens the ML prediction
            # e.g. ML says 1.3x (congestion), rain says +30% → result = 1.3 * 1.3 = 1.69
            weather_adj = w_mult

            # Extra penalties for specific Tamil Nadu conditions
            if rainfall > 50:       # Heavy monsoon rainfall
                weather_adj *= 1.10
            if wind > 60:           # Strong winds (cyclone conditions in TN coast)
                weather_adj *= 1.08
            if visibility < 200:    # Dense fog (NH highways in winter mornings)
                weather_adj *= 1.12

            combined = base * weather_adj
            # Hard cap at 3.0x to prevent absurd ETAs
            return float(max(TrafficModelMetadata.CLIP_MIN, min(combined, 3.0)))

        return base

predictor = TrafficPredictor()  # Export a singleton instance for global use in routing calculations
