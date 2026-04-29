import pytest
import asyncio
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.utils.database import Base, engine
from app.utils.firebase_auth import get_firebase_user

# --- MOCK AUTH FOR TESTING ---
# This allows us to bypass actual Firebase network calls during tests
async def mock_get_firebase_user():
    return {"uid": "test-user-123", "email": "admin@tnimpact.com", "role": "admin"}

@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()

@pytest.fixture(scope="session", autouse=True)
async def setup_db():
    # Create tables in the test database (usually SQLite in memory or temp file)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

@pytest.fixture
async def client():
    # Override the auth dependency with our mock
    app.dependency_overrides[get_firebase_user] = mock_get_firebase_user
    
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
    
    # Clear overrides after test
    app.dependency_overrides.clear()
