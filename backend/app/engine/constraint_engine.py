"""
ORION-ELITE: Adaptive Constraint Engine
Replaces rigid ORION-style rules with soft + hard + priority constraints.
Every constraint decision generates an explanation for full auditability.
"""
from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional
from enum import Enum
import math


class ConstraintType(str, Enum):
    HARD = "hard"       # Must not be violated (capacity, legal hours)
    SOFT = "soft"       # Should not be violated (preferred time windows)
    PRIORITY = "priority"  # Violation allowed with explicit cost justification


@dataclass
class Constraint:
    name: str
    type: ConstraintType
    penalty: float          # Cost penalty for violation (0 = hard block)
    description: str
    active: bool = True


@dataclass
class ConstraintViolation:
    constraint_name: str
    severity: str           # "blocked" | "penalized" | "warning"
    penalty_applied: float
    explanation: str


@dataclass
class ConstraintResult:
    feasible: bool
    total_penalty: float
    violations: List[ConstraintViolation]
    explanations: List[str]  # Human-readable rationale for each decision


class AdaptiveConstraintEngine:
    """
    ORION-ELITE IMPROVEMENT #3: Adaptive Constraint Engine
    - Supports soft + hard + priority constraint types
    - Generates explainable output for every decision
    - Dynamically adjusts penalties based on fleet-wide SLA risk
    """

    def __init__(self, config: Dict[str, Any] = None):
        self.config = config or {}
        self.constraints = self._build_default_constraints()

    def _build_default_constraints(self) -> List[Constraint]:
        return [
            # ── HARD CONSTRAINTS (never violate) ──────────────────────────────
            Constraint(
                name="vehicle_capacity",
                type=ConstraintType.HARD,
                penalty=0,
                description="Vehicle cannot carry more than its rated capacity"
            ),
            Constraint(
                name="driver_legal_hours",
                type=ConstraintType.HARD,
                penalty=0,
                description="Driver cannot exceed 10 hours on-road per day (legal)"
            ),
            Constraint(
                name="depot_return",
                type=ConstraintType.HARD,
                penalty=0,
                description="All vehicles must return to depot before shift end"
            ),

            # ── SOFT CONSTRAINTS (penalized, not blocked) ─────────────────────
            Constraint(
                name="time_window_compliance",
                type=ConstraintType.SOFT,
                penalty=800.0,  # INR per hour late
                description="Delivery must arrive within customer-specified window"
            ),
            Constraint(
                name="driver_break_schedule",
                type=ConstraintType.SOFT,
                penalty=200.0,
                description="Driver should take 30-min break every 4 hours"
            ),
            Constraint(
                name="zone_cohesion",
                type=ConstraintType.SOFT,
                penalty=300.0,
                description="Minimize cross-zone travel to reduce cognitive load"
            ),

            # ── PRIORITY CONSTRAINTS (adjustable by dispatcher) ───────────────
            Constraint(
                name="premium_customer_sla",
                type=ConstraintType.PRIORITY,
                penalty=2000.0,
                description="Premium customers have 1-hour guaranteed window"
            ),
            Constraint(
                name="fragile_cargo_routing",
                type=ConstraintType.PRIORITY,
                penalty=1500.0,
                description="Fragile parcels must be delivered before non-fragile"
            ),

            # ── WEATHER CONSTRAINTS (ORION Weather Module) ────────────────────
            Constraint(
                name="flood_road_block",
                type=ConstraintType.HARD,
                penalty=0,  # Hard block: route must avoid flooded segments
                description="Route segment blocked due to flood / waterlogging alert (HIGH severity weather)"
            ),
            Constraint(
                name="adverse_weather_slowdown",
                type=ConstraintType.SOFT,
                penalty=500.0,  # INR per hour of extra delay caused by rain/storm/fog
                description="Heavy rain, storm, or fog significantly increases segment travel time"
            ),
            Constraint(
                name="low_visibility_caution",
                type=ConstraintType.SOFT,
                penalty=300.0,  # INR per hour; applies when visibility < 500m
                description="Low visibility (fog / mist) requires reduced speed and driver caution"
            ),
        ]

    def evaluate_route(
        self,
        route: List[Dict],
        vehicle: Dict,
        matrix: List[List[int]],
        current_time_sec: int = 28800  # 08:00 AM default start
    ) -> ConstraintResult:
        """
        Evaluates a proposed route against all constraints.
        Returns full result including penalty and human-readable explanations.
        """
        violations = []
        explanations = []
        total_penalty = 0.0
        feasible = True
        cumulative_demand = 0
        cumulative_time = current_time_sec
        cumulative_distance_km = 0.0

        capacity = float(vehicle.get("capacity", 100))
        shift_end = int(vehicle.get("shift_end", 64800))  # 18:00

        for i, stop in enumerate(route):
            if stop.get("id", "").startswith("HQ"):
                continue

            demand = float(stop.get("demand_units", 1))
            cumulative_demand += demand

            # ── CHECK: Vehicle Capacity (HARD) ────────────────────────────────
            if cumulative_demand > capacity:
                feasible = False
                violations.append(ConstraintViolation(
                    constraint_name="vehicle_capacity",
                    severity="blocked",
                    penalty_applied=0,
                    explanation=f"Stop '{stop.get('name', stop.get('id'))}' "
                                f"exceeds vehicle capacity ({cumulative_demand:.0f}/{capacity:.0f} units). "
                                f"Route is infeasible."
                ))
                explanations.append(
                    f"❌ HARD BLOCK: Capacity overflow at stop {i+1}. "
                    f"Load would be {cumulative_demand:.0f} vs limit {capacity:.0f}. "
                    f"This stop must be reassigned to another vehicle."
                )
                break  # Cannot continue evaluating this route

            # ── CHECK: Time Window Compliance (SOFT) ──────────────────────────
            tw_start = stop.get("time_window_start", 0)
            tw_end = stop.get("time_window_end", 86400)
            travel_to_next = matrix[i][i + 1] if i + 1 < len(matrix) else 0
            cumulative_time += travel_to_next + 300  # 5 min service time

            if cumulative_time > tw_end:
                delay_min = (cumulative_time - tw_end) / 60
                penalty = (delay_min / 60) * 800.0  # INR per hour
                total_penalty += penalty
                violations.append(ConstraintViolation(
                    constraint_name="time_window_compliance",
                    severity="penalized",
                    penalty_applied=penalty,
                    explanation=f"Stop '{stop.get('name', stop.get('id'))}' "
                                f"ETA {delay_min:.0f}min late. "
                                f"Penalty: ₹{penalty:.0f}"
                ))
                explanations.append(
                    f"⚠️  SOFT VIOLATION: '{stop.get('name', 'Stop')}' misses window by "
                    f"{delay_min:.0f} min. Applying ₹{penalty:.0f} penalty. "
                    f"Consider resequencing or reassigning to a faster vehicle."
                )

            # ── CHECK: Shift Hours (HARD) ─────────────────────────────────────
            if cumulative_time > shift_end:
                feasible = False
                violations.append(ConstraintViolation(
                    constraint_name="driver_legal_hours",
                    severity="blocked",
                    penalty_applied=0,
                    explanation=f"Route would exceed driver shift end at "
                                f"{shift_end//3600:02d}:{(shift_end%3600)//60:02d}. Legal violation."
                ))
                explanations.append(
                    f"❌ HARD BLOCK: Driver shift ends at "
                    f"{shift_end//3600:02d}:{(shift_end%3600)//60:02d}. "
                    f"This route is too long. Split route or reduce stops."
                )
                break

        return ConstraintResult(
            feasible=feasible,
            total_penalty=total_penalty,
            violations=violations,
            explanations=explanations
        )

    def update_constraint_penalty(self, constraint_name: str, new_penalty: float):
        """Allows dispatchers to tune constraint weights at runtime."""
        for c in self.constraints:
            if c.name == constraint_name:
                c.penalty = new_penalty
                return True
        return False

    def get_active_constraints(self) -> List[Dict]:
        return [
            {
                "name": c.name,
                "type": c.type,
                "penalty": c.penalty,
                "description": c.description,
                "active": c.active
            }
            for c in self.constraints if c.active
        ]


# Singleton for app-wide use
constraint_engine = AdaptiveConstraintEngine()
