import asyncio
import os
import sys

# Add the current directory to sys.path to import app
sys.path.append(os.getcwd())

from app.db.database import async_session
from app.models.db_models import User
from sqlalchemy import select

async def list_users():
    async with async_session() as session:
        res = await session.execute(select(User))
        users = res.scalars().all()
        print("Users found in database:")
        for u in users:
            print(f"- Email: {u.email}, Role: {u.role}")

if __name__ == "__main__":
    asyncio.run(list_users())
