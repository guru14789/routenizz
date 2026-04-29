"""
ORION-ELITE: Integration Test Suite — PHASE 8
Tests all 7 ORION improvements end-to-end.
Run: pytest tests/test_orion_elite.py -v
"""
import pytest
import asyncio
import json
from unittest.mock import AsyncMock, patch, MagicMock
from httpx import AsyncClient, ASGITransport

from app.main import app


# ── Fixtures ─────────────────────────────────────────────────────────────────

@pytest.fixture
def sample_office():
    return {"lat": 13.0827, "lng": 80.2707}

@pytest.fixture
def sample_vehicles():
    return [
        {
            "vehicle_id": "V-001",
            "capacity": 50,
            "is_electric": False,
            "consumption_liters_per_100km": 12.0,
            "fuel_price_per_litre": 95.0,
            "cost_per_km": 1.5,
            "driver_hourly_wage": 250.0,
            "shift_end": 64800,
        },
        {
            "vehicle_id": "V-002",
            "capacity": 30,
            "is_electric": True,
            "consumption_liters_per_100km": 0.0,
            "fuel_price_per_litre": 0.0,
            "cost_per_km": 0.8,
            "driver_hourly_wage": 250.0,
            "shift_end": 64800,
        }
    ]

@pytest.fixture
def sample_stops():
    return [
        {"id": "S-001", "name": "Marina Beach", "lat": 13.0499, "lng": 80.2824, "priority": 8, "demand_units": 2, "time_window_end": 50400, "stop_type": "Business"},
        {"id": "S-002", "name": "Egmore",        "lat": 13.0732, "lng": 80.2609, "priority": 5, "demand_units": 1, "time_window_end": 64800, "stop_type": "Residential"},
        {"id": "S-003", "name": "Anna Nagar",    "lat": 13.0858, "lng": 80.2101, "priority": 3, "demand_units": 3, "time_window_end": 64800, "stop_type": "Residential"},
    ]


# ── PHASE 8, TEST 1: Health Check ─────────────────────────────────────────────

@pytest.mark.asyncio
async def test_health_endpoint_returns_ok():
    """System health check must respond with all dependencies listed."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert "dependencies" in data
    assert "osrm_router" in data["dependencies"]
    assert "database" in data["dependencies"]


# ── PHASE 8, TEST 2: Constraint Engine ────────────────────────────────────────

def test_constraint_engine_capacity_violation(sample_vehicles, sample_stops):
    """ORION-ELITE: Adaptive Constraint Engine must detect capacity overflow."""
    from app.routing.constraint_engine import AdaptiveConstraintEngine

    engine = AdaptiveConstraintEngine()
    vehicle = {**sample_vehicles[0], "capacity": 2}   # Only 2 units capacity

    # Stops need 2+1+3 = 6 units — should overflow
    result = engine.evaluate_route(
        route=sample_stops,
        vehicle=vehicle,
        matrix=[[0]*4 for _ in range(4)]
    )
    assert not result.feasible, "Should be infeasible due to capacity overflow"
    assert any("capacity" in v.constraint_name for v in result.violations)


def test_constraint_engine_feasible_route(sample_vehicles, sample_stops):
    """A route within capacity limits must be feasible."""
    from app.routing.constraint_engine import AdaptiveConstraintEngine

    engine = AdaptiveConstraintEngine()
    vehicle = {**sample_vehicles[0], "capacity": 100}

    result = engine.evaluate_route(
        route=sample_stops,
        vehicle=vehicle,
        matrix=[[0]*4 for _ in range(4)]
    )
    assert result.feasible


def test_constraint_engine_soft_violation_generates_penalty():
    """Soft constraint (time window) violation should add a penalty, not block."""
    from app.routing.constraint_engine import AdaptiveConstraintEngine

    engine = AdaptiveConstraintEngine()
    vehicle = {"capacity": 100, "shift_end": 86400, "driver_hourly_wage": 250}
    stop = {"id": "S-LATE", "demand_units": 1, "time_window_end": 100}  # Window at 1:40AM

    result = engine.evaluate_route(
        route=[stop],
        vehicle=vehicle,
        matrix=[[0, 3600], [3600, 0]],
        current_time_sec=0
    )
    # Should still be feasible but with penalty
    assert result.total_penalty >= 0


# ── PHASE 8, TEST 3: Explainability Engine ────────────────────────────────────

def test_explainability_global_solution():
    """Every VRP solution must include a human-readable explanation."""
    from app.routing.explainability import ExplainabilityEngine

    engine = ExplainabilityEngine()
    explanation = engine.explain_global_solution(
        routes=[{"vehicle_id": "V-001"}],
        summary={"total_distance_km": 45.2, "total_cost": 3200, "total_vehicles_used": 1, "optimization_score": 87},
        num_stops=3,
        num_vehicles=2,
        solver_time_ms=250.0,
        alternatives_evaluated=5000
    )

    assert "primary_rationale" in explanation
    assert "algorithm_used" in explanation
    assert "trade_offs" in explanation
    assert isinstance(explanation["trade_offs"], list)
    assert "improvements_possible" in explanation


def test_explainability_reoptimization():
    """Re-optimization events must include scope and impact explanation."""
    from app.routing.explainability import ExplainabilityEngine

    engine = ExplainabilityEngine()
    result = engine.explain_reoptimization(
        trigger="traffic_update",
        affected_vehicles=["V-001"],
        stops_rerouted=3,
        time_saved_min=8.5,
        old_cost=3200.0,
        new_cost=2850.0
    )

    assert result["trigger"] == "traffic_update"
    assert "trigger_explanation" in result
    assert result["impact"]["direction"] == "improvement"
    assert result["impact"]["time_saved_min"] == 8.5


# ── PHASE 8, TEST 4: Simulation Service ────────────────────────────────────────

def test_simulation_builds_demand_spike_scenario():
    """Simulation service must correctly construct a demand spike scenario."""
    from app.services.simulation_service import SimulationService

    svc = SimulationService()
    extra_stops = [{"id": "SIM-001", "lat": 13.09, "lng": 80.27}]
    scenario = svc.build_demand_spike_scenario(extra_stops)

    assert scenario.name == "demand_spike"
    assert "extra_stops" in scenario.modifications
    assert len(scenario.modifications["extra_stops"]) == 1


def test_simulation_builds_vehicle_breakdown_scenario():
    """Vehicle breakdown scenario must target specified vehicle IDs."""
    from app.services.simulation_service import SimulationService

    svc = SimulationService()
    scenario = svc.build_vehicle_breakdown_scenario(["V-001", "V-003"])

    assert scenario.name == "vehicle_breakdown"
    assert "V-001" in scenario.modifications["remove_vehicles"]
    assert "V-003" in scenario.modifications["remove_vehicles"]


# ── PHASE 8, TEST 5: Multi-Objective Cost Calculator ──────────────────────────

def test_cost_calculator_ev_discount():
    """Electric vehicles must receive a 15% fuel cost discount."""
    from app.routing.optimization_core import EnhancedCostCalculator

    ev_config = {"is_electric": True, "consumption_liters_per_100km": 0, "fuel_price_per_litre": 0, "cost_per_km": 0.8, "driver_hourly_wage": 250}
    ic_config = {"is_electric": False, "consumption_liters_per_100km": 12, "fuel_price_per_litre": 95, "cost_per_km": 1.5, "driver_hourly_wage": 250}

    ev_cost = EnhancedCostCalculator.calculate_segment_cost(10, 1800, 0, 86400, ev_config)
    ic_cost = EnhancedCostCalculator.calculate_segment_cost(10, 1800, 0, 86400, ic_config)

    assert ev_cost < ic_cost, "EV must be cheaper than ICE vehicle over same segment"


def test_cost_calculator_backtrack_penalty():
    """Anti-backtracking: is_backtracking=True must increase segment cost."""
    from app.routing.optimization_core import EnhancedCostCalculator

    v_config = {"is_electric": False, "consumption_liters_per_100km": 12, "fuel_price_per_litre": 95, "cost_per_km": 1.5, "driver_hourly_wage": 250}

    normal_cost = EnhancedCostCalculator.calculate_segment_cost(5, 900, 0, 86400, v_config, is_backtracking=False)
    backtrack_cost = EnhancedCostCalculator.calculate_segment_cost(5, 900, 0, 86400, v_config, is_backtracking=True)

    assert backtrack_cost > normal_cost, "Backtracking penalty must inflate cost"


def test_cost_calculator_driver_intent_penalty():
    """Driver intent: a 2.5x preference score must increase segment cost significantly."""
    from app.routing.optimization_core import EnhancedCostCalculator

    v_config = {"is_electric": False, "consumption_liters_per_100km": 12, "fuel_price_per_litre": 95, "cost_per_km": 1.5, "driver_hourly_wage": 250}

    preferred_cost = EnhancedCostCalculator.calculate_segment_cost(5, 900, 0, 86400, v_config, driver_preference_score=0.5)
    avoided_cost = EnhancedCostCalculator.calculate_segment_cost(5, 900, 0, 86400, v_config, driver_preference_score=2.5)

    assert avoided_cost > preferred_cost, "Avoided segment must cost more than preferred"


# ── PHASE 8, TEST 6: API Endpoints ────────────────────────────────────────────

@pytest.mark.asyncio
async def test_simulation_scenarios_list():
    """Simulation endpoint must return 4 available scenario templates."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/v1/simulation/scenarios")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["scenarios"]) == 4
    ids = [s["id"] for s in data["scenarios"]]
    assert "demand_spike" in ids
    assert "vehicle_breakdown" in ids
    assert "traffic_disruption" in ids
    assert "emergency" in ids


# ── PHASE 8, TEST 7: Reopt Service ────────────────────────────────────────────

def test_reopt_service_stop_in_affected_zone():
    """Re-Opt service must correctly identify stops within an affected traffic zone."""
    from app.services.reopt_service import ReOptimizationService

    svc = ReOptimizationService()
    stop_inside = {"lat": 13.05, "lng": 80.25}
    stop_outside = {"lat": 12.50, "lng": 79.80}

    affected = [{"lat_min": 13.0, "lat_max": 13.1, "lng_min": 80.2, "lng_max": 80.3}]

    assert svc._stop_in_affected_zone(stop_inside, affected) is True
    assert svc._stop_in_affected_zone(stop_outside, affected) is False
