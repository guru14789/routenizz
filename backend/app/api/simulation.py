"""
ORION-ELITE: Simulation API Routes
Exposes what-if scenario endpoints for the dispatcher dashboard.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any, Optional

from app.services.simulation_service import simulation_service, SimulationScenario
from app.core.logger import logger

router = APIRouter()


class ExtraStop(BaseModel):
    id: str
    name: str
    lat: float
    lng: float
    demand_units: float = 1.0
    priority: int = 5
    time_window_start: int = 0
    time_window_end: int = 86400
    stop_type: str = "Residential"


class SimulationRequest(BaseModel):
    office: Dict[str, Any]
    vehicles: List[Dict[str, Any]]
    stops: List[Dict[str, Any]]
    scenario_type: str  # "demand_spike" | "vehicle_breakdown" | "traffic_disruption" | "emergency"
    # Scenario-specific params:
    extra_stops: Optional[List[Dict[str, Any]]] = None
    remove_vehicle_ids: Optional[List[str]] = None
    traffic_multiplier: Optional[float] = 1.5


@router.post("/simulation/run")
async def run_simulation(request: SimulationRequest):
    """
    PHASE 7 API: Run a what-if simulation scenario.

    Request body example:
    {
        "office": {"lat": 13.0827, "lng": 80.2707},
        "vehicles": [...],
        "stops": [...],
        "scenario_type": "demand_spike",
        "extra_stops": [{"id": "SIM-001", "lat": 13.09, "lng": 80.27, ...}]
    }

    Returns a comparison report: baseline vs simulated costs, duration, CO2, and recommendation.
    """
    try:
        stype = request.scenario_type

        if stype == "demand_spike":
            if not request.extra_stops:
                raise HTTPException(400, "demand_spike requires extra_stops")
            scenario = simulation_service.build_demand_spike_scenario(request.extra_stops)

        elif stype == "vehicle_breakdown":
            if not request.remove_vehicle_ids:
                raise HTTPException(400, "vehicle_breakdown requires remove_vehicle_ids")
            scenario = simulation_service.build_vehicle_breakdown_scenario(request.remove_vehicle_ids)

        elif stype == "traffic_disruption":
            scenario = simulation_service.build_traffic_disruption_scenario(
                request.traffic_multiplier or 1.5
            )

        elif stype == "emergency":
            scenario = simulation_service.build_emergency_mode_scenario()

        else:
            raise HTTPException(400, f"Unknown scenario_type: {stype}")

        result = await simulation_service.run_scenario(
            office=request.office,
            vehicles=request.vehicles,
            stops=request.stops,
            scenario=scenario
        )

        return {
            "status": "success",
            "scenario": result.scenario_name,
            "comparison": {
                "baseline": {
                    "cost": result.baseline_cost,
                    "duration_min": result.baseline_duration_min,
                    "co2_kg": result.baseline_co2_kg
                },
                "simulated": {
                    "cost": result.simulated_cost,
                    "duration_min": result.simulated_duration_min,
                    "co2_kg": result.simulated_co2_kg
                },
                "delta": {
                    "cost": result.cost_delta,
                    "duration_min": result.duration_delta_min,
                    "co2_kg": result.co2_delta_kg
                }
            },
            "routes_affected": result.routes_affected,
            "explanation": result.explanation,
            "recommendation": result.recommendation
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[SIM API] Error: {e}")
        raise HTTPException(500, f"Simulation failed: {str(e)}")


@router.get("/simulation/scenarios")
async def list_scenarios():
    """Returns all available scenario templates."""
    return {
        "scenarios": [
            {
                "id": "demand_spike",
                "name": "Demand Spike",
                "description": "Simulate sudden injection of new orders mid-route",
                "required_params": ["extra_stops"]
            },
            {
                "id": "vehicle_breakdown",
                "name": "Vehicle Breakdown",
                "description": "Remove one or more vehicles from the active fleet",
                "required_params": ["remove_vehicle_ids"]
            },
            {
                "id": "traffic_disruption",
                "name": "Traffic Disruption",
                "description": "Simulate major road slowdown (e.g. accident, event)",
                "required_params": ["traffic_multiplier"]
            },
            {
                "id": "emergency",
                "name": "Emergency Mode",
                "description": "Override all stop priorities to maximum (emergency dispatch)",
                "required_params": []
            }
        ]
    }
