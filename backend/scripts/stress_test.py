import asyncio
import time
import random
import os
import sys

# Ensure backend is in path
sys.path.append(os.path.join(os.getcwd(), "backend"))

from app.engine.vrp_solver import vrp_solver
from app.core.logger import logger

async def run_stress_test(num_stops=100, num_vehicles=10):
    print(f"🚀 Starting Stress Test: {num_stops} stops, {num_vehicles} vehicles")
    
    office = {"lat": 13.0827, "lng": 80.2707} # Chennai HQ
    
    # Generate random stops around Chennai
    stops = []
    for i in range(num_stops):
        stops.append({
            "id": f"S-{i}",
            "name": f"Stop {i}",
            "lat": 13.0827 + (random.random() - 0.5) * 0.2,
            "lng": 80.2707 + (random.random() - 0.5) * 0.2,
            "priority": random.randint(1, 10),
            "demand_units": random.randint(1, 5),
            "time_window_start": 0,
            "time_window_end": 86400,
            "stop_type": random.choice(["Business", "Residential"])
        })
        
    # Generate vehicles
    vehicles = []
    for i in range(num_vehicles):
        vehicles.append({
            "vehicle_id": f"V-{i}",
            "capacity": 50,
            "consumption_liters_per_100km": 12.0,
            "fuel_price_per_litre": 95.0,
            "cost_per_km": 1.5,
            "driver_hourly_wage": 250.0,
            "shift_start": 0,
            "shift_end": 86400
        })

    print("📊 Inputs generated. Triggering VRP Solver...")
    
    # We use the haversine fallback by mocking matrix_builder.get_duration_matrix to return None
    from unittest.mock import patch
    with patch("app.engine.matrix_builder.matrix_builder.get_duration_matrix", return_value=None):
        with patch("app.engine.route_builder.route_builder.build_full_route_data", return_value={"geometry": "mock_geom", "distance_km": 10, "duration_min": 20}):
            start_time = time.monotonic()
            try:
                result = await vrp_solver.solve_vrp(office, vehicles, stops)
                end_time = time.monotonic()
                
                duration = end_time - start_time
                print(f"✅ Stress Test Completed in {duration:.2f} seconds")
                
                summary = result.get("summary", {})
                meta_stats = result.get("metaheuristic_stats", {})
                
                print(f"   - Total Distance: {summary.get('total_distance_km')} km")
                print(f"   - Total Cost: ₹{summary.get('total_cost')}")
                print(f"   - Optimization Score: {result.get('optimization_score')}")
                print(f"   - Meta Stats: {meta_stats}")
                
                if duration > 10:
                    print("⚠️  Warning: Solver took longer than 10 seconds. Check efficiency.")
                else:
                    print("✨ Performance is within acceptable enterprise bounds.")
                    
            except Exception as e:
                print(f"❌ Stress Test Failed: {e}")
                import traceback
                traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(run_stress_test())
