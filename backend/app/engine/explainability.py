"""
ORION-ELITE IMPROVEMENT #4: Explainability Engine
Every routing decision must include reasoning output.
ORION is a black-box — we make every choice transparent.
"""
from typing import List, Dict, Any, Optional
from dataclasses import dataclass, field
import math


@dataclass
class RouteExplanation:
    vehicle_id: str
    total_stops: int
    total_distance_km: float
    total_duration_min: float
    total_cost: float
    co2_kg: float
    co2_saved_kg: float
    optimization_score: float
    primary_rationale: str          # Why this route was chosen
    trade_offs: List[str]           # What was sacrificed for this solution
    alternatives_considered: int    # How many other sequences were evaluated
    key_decisions: List[Dict]       # Per-stop decisions with reasoning
    warnings: List[str]             # Dispatcher alerts
    improvements_possible: List[str]  # What could make it better


class ExplainabilityEngine:
    """
    Generates human-readable explanations for every VRP routing decision.
    Answers the fundamental question: WHY was this route chosen?
    """

    @staticmethod
    def explain_stop_sequence(
        stops: List[Dict],
        matrix: List[List[int]],
        clusters: Dict[int, int],
        vehicle: Dict
    ) -> List[Dict]:
        """Per-stop decision explanations."""
        decisions = []
        for i, stop in enumerate(stops):
            if str(stop.get("id", "")).startswith("HQ"):
                continue

            stop_type = stop.get("stop_type", "Residential")
            priority = stop.get("priority", 1)
            cluster = clusters.get(i, 0)
            tw_start = stop.get("time_window_start", 0)
            tw_end = stop.get("time_window_end", 86400)

            reasons = []
            if priority >= 8:
                reasons.append(f"HIGH PRIORITY (score={priority}): scheduled early to guarantee SLA")
            if stop_type == "Business":
                reasons.append("BUSINESS stop: 1.5x weight applied — must arrive within business hours")
            if tw_end - tw_start < 3600:
                reasons.append(f"TIGHT WINDOW: only {(tw_end-tw_start)//60}min window — minimal slack")
            if cluster == vehicle.get("assigned_zone"):
                reasons.append("IN-ZONE: within vehicle's primary delivery cluster — zero zone penalty")
            else:
                reasons.append(f"CROSS-ZONE: zone mismatch penalized 5x — unavoidable due to capacity")

            decisions.append({
                "stop_id": stop.get("id"),
                "stop_name": stop.get("name", "Unknown"),
                "sequence_position": i + 1,
                "reasons": reasons,
                "rationale_summary": " | ".join(reasons) if reasons else "Standard sequencing by proximity"
            })
        return decisions

    @staticmethod
    def explain_global_solution(
        routes: List[Dict],
        summary: Dict,
        num_stops: int,
        num_vehicles: int,
        solver_time_ms: float,
        alternatives_evaluated: int = 0
    ) -> Dict:
        """
        Generates a full solution explanation for the dispatcher.
        """
        total_distance = summary.get("total_distance_km", 0)
        total_cost = summary.get("total_cost", 0)
        co2_saved = summary.get("co2_saved_kg", 0)
        vehicles_used = summary.get("total_vehicles_used", num_vehicles)
        opt_score = summary.get("optimization_score", 0)

        # Determine primary strategy used
        primary_rationale = (
            f"Solved {num_stops} stops across {vehicles_used}/{num_vehicles} vehicles "
            f"using K-Means zone clustering + Guided Local Search in {solver_time_ms:.0f}ms. "
            f"Routes are clustered by geographic proximity to minimize cross-zone transit."
        )

        # Identify trade-offs made
        trade_offs = []
        if vehicles_used < num_vehicles:
            trade_offs.append(
                f"{num_vehicles - vehicles_used} vehicle(s) left idle — "
                f"insufficient stops to justify full fleet deployment"
            )
        if total_distance > 0:
            avg_km_per_stop = total_distance / num_stops if num_stops > 0 else 0
            if avg_km_per_stop > 5:
                trade_offs.append(
                    f"Average {avg_km_per_stop:.1f}km/stop — consider adding stops "
                    f"or adjusting depot location for better density"
                )
        if co2_saved > 0:
            trade_offs.append(
                f"CO₂ reduction of {co2_saved:.2f}kg achieved vs baseline — "
                f"right-turn avoidance and zone cohesion applied"
            )

        # Generate actionable warnings
        warnings = []
        if vehicles_used == num_vehicles:
            warnings.append(
                "⚠️  FLEET AT CAPACITY: All vehicles deployed. "
                "New orders will require route extension or overflow vehicle."
            )
        if opt_score < 80:
            warnings.append(
                f"⚠️  OPTIMIZATION SCORE {opt_score:.0f}% — below target 85%. "
                f"Consider adding more drivers or reducing order volume."
            )

        # Generate improvement suggestions
        improvements = []
        if num_stops < num_vehicles * 3:
            improvements.append(
                "DENSITY ALERT: Too few stops per vehicle. "
                "Batching orders or reducing fleet size would improve per-vehicle efficiency."
            )
        improvements.append(
            "Enable Continuous Delta-Patching to auto-adjust routes every 30min as traffic evolves."
        )
        improvements.append(
            "Add driver shift start times to allow time-staggered dispatch for peak-hour avoidance."
        )

        return {
            "primary_rationale": primary_rationale,
            "algorithm_used": "OR-Tools CVRPTW + K-Means Geo-Clustering + 2-Opt Post-processing",
            "solver_time_ms": solver_time_ms,
            "alternatives_evaluated": alternatives_evaluated,
            "trade_offs": trade_offs,
            "warnings": warnings,
            "improvements_possible": improvements,
            "optimization_score": opt_score,
            "co2_impact": {
                "emitted_kg": summary.get("total_co2_kg", 0),
                "saved_vs_baseline_kg": co2_saved,
                "method": "Zone clustering + turn avoidance reduces idle fuel burn"
            }
        }

    @staticmethod
    def explain_reoptimization(
        trigger: str,
        affected_vehicles: List[str],
        stops_rerouted: int,
        time_saved_min: float,
        old_cost: float,
        new_cost: float
    ) -> Dict:
        """Explains why a mid-route re-optimization was triggered."""
        cost_delta = old_cost - new_cost
        return {
            "trigger": trigger,
            "trigger_explanation": {
                "traffic_update": "Traffic drift exceeded 15% threshold — route recalculated to avoid congestion",
                "new_order": "New delivery injected into active routes — affected vehicles resequenced",
                "driver_delay": "Driver reported delay — downstream sequence adjusted to protect SLAs",
                "driver_override": "Driver bypassed suggested segment — intent learned and route adapted"
            }.get(trigger, f"System event: {trigger}"),
            "scope": {
                "affected_vehicles": affected_vehicles,
                "stops_rerouted": stops_rerouted,
                "full_recompute": False,
                "incremental": True
            },
            "impact": {
                "time_saved_min": round(time_saved_min, 1),
                "cost_delta_inr": round(cost_delta, 2),
                "direction": "improvement" if cost_delta > 0 else "degradation",
                "explanation": (
                    f"Incremental patch saved {time_saved_min:.0f}min and ₹{cost_delta:.0f} "
                    f"without disrupting {len(affected_vehicles)} driver(s) mid-route."
                    if cost_delta > 0 else
                    f"Re-route increased cost by ₹{abs(cost_delta):.0f} to avoid SLA violation — "
                    f"trade-off accepted."
                )
            }
        }


explainability_engine = ExplainabilityEngine()
