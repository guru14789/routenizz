from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from app.core.config import config

import os

# Create Async Engine with production-grade pooling
# For PostgreSQL: postgresql+asyncpg://user:password@localhost/db
DB_URL = config.DATABASE_URL

db_kwargs = {"echo": False}
if DB_URL.startswith("postgresql"):
    db_kwargs.update({
        "pool_size": 20,
        "max_overflow": 10,
        "pool_pre_ping": True,
    })

engine = create_async_engine(DB_URL, **db_kwargs)

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
