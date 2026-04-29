"""
ORION-ELITE: Simulation Service
Run what-if scenarios — test demand spikes, disruptions, and route alternatives.
Returns a comparison report with Explainability output.
"""
import time
import copy
import asyncio
from typing import List, Dict, Any, Optional
from dataclasses import dataclass

from app.core.logger import logger
from app.engine.explainability import explainability_engine


@dataclass
class SimulationScenario:
    name: str
    description: str
    modifications: Dict[str, Any]  # What changes to apply to the base state


@dataclass
class SimulationResult:
    scenario_name: str
    baseline_cost: float
    simulated_cost: float
    cost_delta: float
    baseline_duration_min: float
    simulated_duration_min: float
    duration_delta_min: float
    baseline_co2_kg: float
    simulated_co2_kg: float
    co2_delta_kg: float
    routes_affected: int
    explanation: Dict
    recommendation: str


class SimulationService:
    """
    ORION-ELITE: What-if Simulation Engine.
    Allows dispatchers to test scenarios before committing to real routes.
    """

    async def run_scenario(
        self,
        office: Dict,
        vehicles: List[Dict],
        stops: List[Dict],
        scenario: SimulationScenario
    ) -> SimulationResult:
        """
        Runs a simulation by applying modifications to the base state
        and comparing the result against the current optimized route.
        """
        from app.engine.vrp_solver import vrp_solver

        start = time.time()
        logger.info(f"[SIM] Running scenario: '{scenario.name}'")

        # ── Baseline solve ─────────────────────────────────────────────────────
        baseline = await vrp_solver.solve_vrp(office, vehicles, stops)
        baseline_summary = baseline.get("summary", {})

        # ── Apply scenario modifications ───────────────────────────────────────
        sim_vehicles = copy.deepcopy(vehicles)
        sim_stops = copy.deepcopy(stops)
        sim_office = copy.deepcopy(office)

        mods = scenario.modifications

        # Demand spike: add N random stops
        if "extra_stops" in mods:
            sim_stops.extend(mods["extra_stops"])

        # Vehicle breakdown: remove N vehicles from fleet
        if "remove_vehicles" in mods:
            ids_to_remove = set(mods["remove_vehicles"])
            sim_vehicles = [v for v in sim_vehicles
                            if str(v.get("vehicle_id")) not in ids_to_remove]

        # Traffic disruption: inflate matrix costs
        if "traffic_multiplier" in mods:
            for stop in sim_stops:
                # Inflate time windows to simulate slower travel
                tw_end = stop.get("time_window_end", 86400)
                stop["time_window_end"] = int(tw_end * (1 / mods["traffic_multiplier"]))

        # Priority override: set all stops to high priority
        if mods.get("emergency_mode"):
            for stop in sim_stops:
                stop["priority"] = 10

        # ── Simulated solve ────────────────────────────────────────────────────
        simulated = await vrp_solver.solve_vrp(sim_office, sim_vehicles, sim_stops)
        sim_summary = simulated.get("summary", {})

        elapsed_ms = (time.time() - start) * 1000

        # ── Compute deltas ─────────────────────────────────────────────────────
        base_cost = float(baseline_summary.get("total_cost", 0))
        sim_cost = float(sim_summary.get("total_cost", 0))
        base_dur = float(baseline_summary.get("total_duration_min", 0))
        sim_dur = float(sim_summary.get("total_duration_min", 0))
        base_co2 = float(baseline_summary.get("total_co2_kg", 0))
        sim_co2 = float(sim_summary.get("total_co2_kg", 0))

        cost_delta = sim_cost - base_cost
        routes_affected = len(simulated.get("routes", []))

        # ── Build recommendation ───────────────────────────────────────────────
        if cost_delta > base_cost * 0.2:
            recommendation = (
                f"⚠️  SCENARIO IMPACT HIGH: Cost increases by ₹{cost_delta:.0f} (+{cost_delta/base_cost*100:.0f}%). "
                f"Pre-position 1 additional vehicle or reduce new order acceptance by 20%."
            )
        elif cost_delta > 0:
            recommendation = (
                f"Scenario is manageable. Cost increase ₹{cost_delta:.0f}. "
                f"Fleet can absorb this load. Monitor driver SLAs closely."
            )
        else:
            recommendation = (
                f"Scenario IMPROVES efficiency by ₹{abs(cost_delta):.0f}. "
                f"Consider implementing permanently."
            )

        explanation = explainability_engine.explain_reoptimization(
            trigger=f"simulation:{scenario.name}",
            affected_vehicles=[r["vehicle_id"] for r in simulated.get("routes", [])],
            stops_rerouted=len(sim_stops),
            time_saved_min=max(0, base_dur - sim_dur),
            old_cost=base_cost,
            new_cost=sim_cost
        )

        logger.info(f"[SIM] '{scenario.name}' complete in {elapsed_ms:.0f}ms. Delta: ₹{cost_delta:.0f}")

        return SimulationResult(
            scenario_name=scenario.name,
            baseline_cost=round(base_cost, 2),
            simulated_cost=round(sim_cost, 2),
            cost_delta=round(cost_delta, 2),
            baseline_duration_min=round(base_dur, 1),
            simulated_duration_min=round(sim_dur, 1),
            duration_delta_min=round(sim_dur - base_dur, 1),
            baseline_co2_kg=round(base_co2, 3),
            simulated_co2_kg=round(sim_co2, 3),
            co2_delta_kg=round(sim_co2 - base_co2, 3),
            routes_affected=routes_affected,
            explanation=explanation,
            recommendation=recommendation
        )

    def build_demand_spike_scenario(self, extra_stops: List[Dict]) -> SimulationScenario:
        return SimulationScenario(
            name="demand_spike",
            description=f"Simulate {len(extra_stops)} sudden new orders",
            modifications={"extra_stops": extra_stops}
        )

    def build_vehicle_breakdown_scenario(self, vehicle_ids: List[str]) -> SimulationScenario:
        return SimulationScenario(
            name="vehicle_breakdown",
            description=f"Simulate breakdown of vehicles: {vehicle_ids}",
            modifications={"remove_vehicles": vehicle_ids}
        )

    def build_traffic_disruption_scenario(self, multiplier: float = 1.5) -> SimulationScenario:
        return SimulationScenario(
            name="traffic_disruption",
            description=f"Simulate {int((multiplier-1)*100)}% traffic slowdown",
            modifications={"traffic_multiplier": multiplier}
        )

    def build_emergency_mode_scenario(self) -> SimulationScenario:
        return SimulationScenario(
            name="emergency_mode",
            description="Simulate all stops elevated to priority 10 (emergency dispatch)",
            modifications={"emergency_mode": True}
        )


simulation_service = SimulationService()
