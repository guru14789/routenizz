"""
USES: Synthetic Traffic Dataset Generator.
SUPPORT: Generates a CSV file containing simulated traffic data profiles (morning peaks, evening peaks) used to train the ML predictor when real GPS history is unavailable.
"""
import pandas as pd  # Import pandas for spreadsheet-like data manipulation and CSV export
import numpy as np  # Import numpy for high-performance random number generation and mathematical logic
import random  # Import random for non-deterministic sampling
from datetime import datetime, timedelta  # Import date utilities for temporal feature engineering

def generate_synthetic_traffic_data(num_samples=10000):  # Main simulation function
    """
    Simulates urban traffic patterns to bootstrap the ML model.
    """
    data = []  # Initialize raw data point container
    
    for _ in range(num_samples):  # Iterate to create 10,000 unique traffic observations
        # Step 1: Feature Sampling
        hour = random.randint(0, 23)  # Sample a random hour of the day
        day_of_week = random.randint(0, 6)  # Sample a random day (0=Monday, 6=Sunday)
        is_holiday = 1 if random.random() < 0.05 else 0  # 5% probability of the day being a public holiday
        region_id = 1  # Standardized region (Chennai Metropolitan area)
        
        # Step 2: Traffic Physics Logic (Base Congestion)
        # We simulate the classic 'M' curve of urban traffic (Peaks at 9am and 6pm)
        multiplier = 1.0  # Start with free-flow speed (No overhead)
        
        if 8 <= hour <= 10:  # Morning rush hour (Typical office commute)
            multiplier += random.uniform(0.6, 1.2)  # Add 60% to 120% overhead
        elif 17 <= hour <= 20:  # Evening rush hour (Return commute)
            multiplier += random.uniform(0.8, 1.5)  # Add 80% to 150% overhead
        elif 12 <= hour <= 14:  # Lunch hour peak (Local delivery surge)
            multiplier += random.uniform(0.2, 0.4)  # Add 20% to 40% overhead
            
        # Step 3: Global Feature Adjustments
        if day_of_week >= 5:  # Weekend bias (Sat/Sun)
            multiplier *= 0.7  # Traffic is generally 30% lighter on weekends
            
        if is_holiday == 1:  # Holiday bias
            multiplier *= 0.5  # Traffic drops significantly during statewide holidays
            
        # Step 4: Random Noise Injection
        # Accounts for unpredictable events like road work or minor accidents
        multiplier += random.uniform(-0.1, 0.1) 
        
        # Step 5: Final Normalization
        # Ensure the multiplier remains within physically possible bounds (1.0 to 3.0)
        multiplier = max(1.0, min(multiplier, 3.0))
        
        data.append({  # Record the synthetic observation
            "hour": hour,
            "day_of_week": day_of_week,
            "is_holiday": is_holiday,
            "region_id": region_id,
            "multiplier": round(multiplier, 4)  # Ground truth value for training
        })

    df = pd.DataFrame(data)  # Convert the list of dicts into a structured DataFrame
    output_path = "ml_models/training_data.csv"  # Define the target destination for the CSV
    df.to_csv(output_path, index=False)  # Save the file without the row ID index
    print(f"Generated {num_samples} traffic rows at {output_path}")  # Log completion to console

if __name__ == "__main__":  # Entry point check
    generate_synthetic_traffic_data()  # Execute the generation script
