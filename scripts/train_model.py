import joblib
import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestRegressor
import os

def train_dummy_model():
    print("🚀 Training TNImpact Traffic Predictor (V2.1)...")
    
    # 1. Create synthetic training data
    data = []
    for day in range(7):  # Mon-Sun
        for hour in range(24):
            for holiday in [0, 1]:
                # Baseline multiplier
                multiplier = 1.0
                
                # Rush hour effect
                if 8 <= hour <= 10 or 17 <= hour <= 19:
                    multiplier += 0.8
                
                # Weekday effect
                if day < 5:
                    multiplier += 0.3
                
                # Holiday effect (less traffic in cities usually)
                if holiday:
                    multiplier -= 0.4
                
                # Add some randomness
                multiplier += np.random.normal(0, 0.1)
                
                # Clip
                multiplier = max(1.0, min(multiplier, 3.5))
                
                data.append({
                    'hour': hour,
                    'day_of_week': day,
                    'is_holiday': holiday,
                    'region_id': 1,
                    'multiplier': multiplier
                })
    
    df = pd.DataFrame(data)
    X = df[['hour', 'day_of_week', 'is_holiday', 'region_id']]
    y = df['multiplier']
    
    # 2. Train a simple Random Forest
    model = RandomForestRegressor(n_estimators=50, random_state=42)
    model.fit(X, y)
    
    # 3. Save the model
    os.makedirs('backend/ml_models', exist_ok=True)
    model_path = 'backend/ml_models/traffic_predictor.joblib'
    joblib.dump(model, model_path)
    print(f"✅ Model saved to {model_path}")

if __name__ == "__main__":
    train_dummy_model()
