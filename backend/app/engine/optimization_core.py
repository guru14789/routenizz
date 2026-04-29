"""
MODULAR ROUTING CORE:
Provides beginner-friendly implementations of 2-opt, cost calculations, and priority handling.
ORION-ELITE: Multi-Objective Scorer.
Balances Distance, Fuel, SLA Confidence, Driver Fatigue, and Environmental Impact.
"""
import math
from typing import List, Dict, Any

class EnhancedCostCalculator:
    """
    ORION-ELITE: Multi-Objective Scorer.
    Balances Distance, Fuel, SLA Confidence, Driver Fatigue, and Environmental Impact.
    """
    @staticmethod
    def calculate_segment_cost(
        distance_km: float, 
        duration_sec: float, 
        arrival_time: int,
        time_window_end: int,
        v_config: Dict[str, Any],
        driver_preference_score: float = 1.0, # 0.5 = favored, 2.0 = avoided
        is_backtracking: bool = False
    ) -> float:
        # 1. Fuel & Sustainability (Module 11)
        consumption = v_config.get('consumption_liters_per_100km', 12.0)
        fuel_price = v_config.get('fuel_price_per_litre', 95.0)
        green_multiplier = 0.85 if v_config.get('is_electric', False) else 1.0
        fuel_cost = (distance_km / 100.0) * consumption * fuel_price * green_multiplier

        # 2. SLA Confidence (Module 03)
        # We penalize routes that arrive dangerously close to the deadline
        sla_buffer_sec = time_window_end - arrival_time
        sla_risk_penalty = 0.0
        if sla_buffer_sec < 900: # Less than 15 mins buffer
            sla_risk_penalty = (900 - max(0, sla_buffer_sec)) * 5.0 # High penalty for risk

        # 3. Driver Fatigue & Logic (Anti-Backtracking)
        # Counter-intuitive routes that 'drive past' a stop are penalized to reduce cognitive load
        backtrack_penalty = 1.5 if is_backtracking else 1.0

        # 4. Driver Intent Learning
        # Incorporates history of driver overrides for specific road segments
        intent_multiplier = driver_preference_score

        # 5. Labor Cost (driver hourly wage × trip hours)
        duration_hours = duration_sec / 3600.0
        hourly_wage = v_config.get('driver_hourly_wage', 250.0)
        labor_cost = duration_hours * hourly_wage

        # 6. Vehicle Wear & Maintenance (cost per km)
        wear_cost = distance_km * v_config.get('cost_per_km', 1.5)

        total_base_cost = fuel_cost + labor_cost + wear_cost

        # Apply Multi-Objective Multipliers
        ev_range_penalty = 0.0
        return (total_base_cost * backtrack_penalty * intent_multiplier) + sla_risk_penalty + ev_range_penalty

class SustainabilityEngine:
    """
    Module 11: Sustainability Optimization Engine.
    """
    @staticmethod
    def calculate_co2_kg(distance_km: float, fuel_consumed_liters: float) -> float:
        return round(fuel_consumed_liters * 2.68, 3)

    @staticmethod
    def calculate_turn_penalty(turn_type: str = 'straight') -> float:
        # Penalize Right Turns (India) - idling and risk mitigation
        penalties = {'right': 1.4, 'left': 1.1, 'u-turn': 2.5}
        return penalties.get(turn_type.lower(), 1.0)

    @staticmethod
    def get_ev_proximity_bonus(lat: float, lng: float, stations: List[Dict]) -> float:
        """
        Calculates a cost reduction if a stop is near an EV charging station.
        This encourages the solver to cluster EV stops near infrastructure.
        """
        if not stations: return 0.0
        min_dist = float('inf')
        for s in stations:
            d = math.sqrt((lat - s['lat'])**2 + (lng - s['lng'])**2)
            if d < min_dist: min_dist = d
        
        # If within 2km (approx 0.02 deg), give a sustainability bonus
        if min_dist < 0.02:
            return -50.0 # INR bonus for proximity
        return 0.0


class TwoOptOptimizer:
    """
    Iterative improvement with 2-opt swap mechanism.
    """
    @staticmethod
    def optimize(route: List[int], matrix: List[List[int]]) -> List[int]:
        best_route = route[:]
        improved = True
        while improved:
            improved = False
            for i in range(1, len(best_route) - 2):
                for j in range(i + 1, len(best_route) - 1):
                    if j - i == 1: continue
                    current_cost = matrix[best_route[i-1]][best_route[i]] + matrix[best_route[j]][best_route[j+1]]
                    new_cost = matrix[best_route[i-1]][best_route[j]] + matrix[best_route[i]][best_route[j+1]]
                    if new_cost < current_cost:
                        best_route[i:j+1] = best_route[i:j+1][::-1]
                        improved = True
            if not improved: break
        return best_route

class PriorityHandler:
    @staticmethod
    def get_priority_penalty(priority: int) -> float:
        return float(priority * 500.0) # ORION-grade priority weighting

    @staticmethod
    def sort_by_priority(stops: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        return sorted(stops, key=lambda x: x.get('priority', 1), reverse=True)
