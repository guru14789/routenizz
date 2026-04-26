import pytest

@pytest.mark.asyncio
async def test_health_endpoint(client):
    """Verifies that the /health monitoring route is operational."""
    resp = await client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert "status" in data
    assert "dependencies" in data

@pytest.mark.asyncio
async def test_optimize_route_async_dispatch(client):
    """
    Verifies that the optimization endpoint successfully dispatches 
    a task to the background queue.
    """
    payload = {
        "office": {"lat": 13.0827, "lng": 80.2707},
        "vehicles": [{"vehicle_id": "V1", "capacity": 100}],
        "stops": [{"id": "S1", "name": "Test Customer", "lat": 13.09, "lng": 80.28, "priority": 10}]
    }
    
    # Send request with mapped 'Authorization' header handled by conftest mockup
    resp = await client.post("/api/v1/logistics/optimize-route", json=payload)
    
    assert resp.status_code == 200
    data = resp.json()
    assert "task_id" in data
    assert data["status"] == "QUEUED"

@pytest.mark.asyncio
async def test_unauthorized_access(client):
    """
    Ensures that routes are protected against missing authentication.
    """
    # Temporarily remove the override to test real failure
    from app.main import app
    from app.utils.firebase_auth import get_firebase_user
    del app.dependency_overrides[get_firebase_user]
    
    resp = await client.get("/api/v1/analytics/engine-status")
    # Should expect 403 or 401 depending on the specific middleware implementation
    assert resp.status_code in [401, 403]
