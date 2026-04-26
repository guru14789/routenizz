"""
MODULAR ROUTING CORE:
Provides beginner-friendly implementations of 2-opt, cost calculations, and priority handling.
"""
import math
from typing import List, Dict, Any

class EnhancedCostCalculator:
    """
    Calculates the combined cost of a route segment.
    Factors: Distance + Fuel + Delay (Time Window Penalty)
    """
    @staticmethod
    def calculate_segment_cost(
        distance_km: float, 
        duration_sec: float, 
        arrival_time: int,
        time_window_end: int,
        v_config: Dict[str, Any]
    ) -> float:
        # 1. Fuel Cost
        consumption = v_config.get('consumption_liters_per_100km', 12.0)
        fuel_price = v_config.get('fuel_price_per_litre', 95.0)
        fuel_cost = (distance_km / 100.0) * consumption * fuel_price

        # 2. Distance Cost (direct wear and tear)
        distance_cost = distance_km * v_config.get('cost_per_km', 1.5)

        # 3. Delay Cost (Soft Penalty for arriving late)
        delay_cost = 0.0
        if arrival_time > time_window_end:
            # Penalty of 500 INR per hour of delay
            delay_sec = arrival_time - time_window_end
            delay_cost = (delay_sec / 3600.0) * 500.0
        
        # 4. Labor Cost (Wages)
        wage = v_config.get('driver_hourly_wage', 250.0)
        labor_cost = (duration_sec / 3600.0) * wage

        return fuel_cost + distance_cost + delay_cost + labor_cost

class TwoOptOptimizer:
    """
    A beginner-friendly implementation of the 2-opt algorithm.
    It swaps segments of a route to remove "crosses" and reduce total distance.
    """
    @staticmethod
    def optimize(route: List[int], matrix: List[List[int]]) -> List[int]:
        """
        Iteratively improves the route using the 2-opt swap mechanism.
        """
        best_route = route[:]
        improved = True
        
        while improved:
            improved = False
            for i in range(1, len(best_route) - 2):
                for j in range(i + 1, len(best_route) - 1):
                    if j - i == 1: continue # Adjacent nodes
                    
                    # Current cost: (i-1 -> i) + (j -> j+1)
                    current_cost = matrix[best_route[i-1]][best_route[i]] + \
                                   matrix[best_route[j]][best_route[j+1]]
                                   
                    # New cost if we swap: (i-1 -> j) + (i -> j+1)
                    new_cost = matrix[best_route[i-1]][best_route[j]] + \
                               matrix[best_route[i]][best_route[j+1]]
                    
                    if new_cost < current_cost:
                        # Perform the 2-opt swap: reverse the segment from i to j
                        best_route[i:j+1] = best_route[i:j+1][::-1]
                        improved = True
            
            if not improved:
                break
                
        return best_route

class PriorityHandler:
    """
    Handles stop prioritization.
    """
    @staticmethod
    def get_priority_penalty(priority: int) -> float:
        """
        Returns a penalty multiplier based on priority.
        Used to make high-priority stops 'heavier' in the cost matrix.
        """
        # Scale 1-10 to a penalty factor
        # Higher priority = higher cost if the stop is NOT visited
        return float(priority * 200.0) 

    @staticmethod
    def sort_by_priority(stops: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Provides a prioritized suggestion for initial ordering.
        """
        return sorted(stops, key=lambda x: x.get('priority', 1), reverse=True)
