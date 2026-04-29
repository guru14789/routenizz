from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from app.core.config import config

# Create Async Engine
engine = create_async_engine(config.DATABASE_URL, echo=False)

# Session Factory
async_session = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

# Base class for Models
class Base(DeclarativeBase):
    pass

async def get_db():
    async with async_session() as session:
        try:
            yield session
        finally:
            await session.close()
