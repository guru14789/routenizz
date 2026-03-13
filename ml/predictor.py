"""
USES: Inference engine for Traffic Prediction.
SUPPORT: Loads the trained Random Forest model and predicts traffic multipliers (congestion factors) for specific time/location contexts.
"""
import joblib  # Library for loading serialized Python objects (the trained model)
import pandas as pd  # Library for structured data manipulation needed for model input
import os  # Standard library for path manipulation and file system checks
from app.config import config  # Import system-wide configuration for model file paths
from app.utils.logger import logger  # Import logging for surfacing model loading or inference errors
from ml.traffic_model import TrafficModelMetadata  # Metadata defining expected features and version

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

    def predict_multiplier(self, hour: int, day_of_week: int, is_holiday: bool = False, region_id: int = 1):
        """
        Predicts traffic multiplier based on time and region features.

        Args:
            hour:        Hour of day (0-23)
            day_of_week: Day of week (0=Monday … 6=Sunday)
            is_holiday:  Whether the day is a public holiday
            region_id:   Geographic region identifier (default 1 = Chennai metro)
        """
        if self.model is None:  # Model not loaded — return safe overhead
            return 1.1

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
            return float(max(TrafficModelMetadata.CLIP_MIN, min(prediction, TrafficModelMetadata.CLIP_MAX)))

        except Exception as e:
            logger.error(f"Traffic prediction error: {e}")
            return 1.2  # Conservative fallback on any runtime error

predictor = TrafficPredictor()  # Export a singleton instance for global use in routing calculations
