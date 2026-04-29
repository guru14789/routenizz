import pytest
from app.routing.vrp_solver import vrp_solver

@pytest.mark.asyncio
async def test_vrp_solver_basic():
    """Verifies that the solver can handle a simple depot + 2 stops scenario."""
    office = {"lat": 13.0827, "lng": 80.2707}
    vehicles = [
        {"vehicle_id": "V1", "capacity": 100, "consumption_liters_per_100km": 10.0}
    ]
    stops = [
        {"id": "S1", "lat": 13.0900, "lng": 80.2800, "demand_units": 10},
        {"id": "S2", "lat": 13.1000, "lng": 80.2900, "demand_units": 20}
    ]
    
    result = await vrp_solver.solve_vrp(office, vehicles, stops)
    
    assert result["status"] == "Success"
    assert len(result["routes"]) >= 1
    assert "summary" in result
    assert result["summary"]["total_vehicles_used"] > 0

@pytest.mark.asyncio
async def test_vrp_solver_empty_fleet():
    """Ensures the solver returns a clean error when no vehicles are provided."""
    office = {"lat": 13.0827, "lng": 80.2707}
    vehicles = []
    stops = [{"id": "S1", "lat": 13.09, "lng": 80.28}]
    
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc:
        await vrp_solver.solve_vrp(office, vehicles, stops)
    assert exc.value.status_code == 400
