from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, EmailStr
from typing import Optional
import datetime

from app.core.auth import create_access_token, verify_password, get_password_hash, get_current_user
from app.db.database import get_db
from app.models.db_models import User, Vehicle
from app.core.config import config

router = APIRouter()

# ── Pydantic Models ────────────────────────────────────────────────────────────

class AdminSignupRequest(BaseModel):
    email: EmailStr
    password: str
    name: Optional[str] = None

class DriverLoginRequest(BaseModel):
    email: str # Registered Gmail / Phone
    pin: str   # Unique PIN provided by Admin

# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post("/admin/signup")
async def admin_signup(req: AdminSignupRequest, db: AsyncSession = Depends(get_db)):
    """
    Dedicated Admin Signup.
    Only allows creation if the email doesn't already exist.
    """
    result = await db.execute(select(User).where(User.email == req.email))
    existing_user = result.scalar_one_or_none()
    if existing_user:
        raise HTTPException(status_code=400, detail="User already exists")
    
    new_admin = User(
        email=req.email,
        hashed_password=get_password_hash(req.password),
        role="admin"
    )
    db.add(new_admin)
    await db.commit()
    return {"success": True, "message": "Admin registered successfully"}

@router.post("/login")
async def login(form_data: OAuth2PasswordRequestForm = Depends(), db: AsyncSession = Depends(get_db)):
    """
    Standard OAuth2 Login for Admins.
    """
    result = await db.execute(select(User).where(User.email == form_data.username).where(User.role == "admin"))
    user = result.scalar_one_or_none()
    
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token = create_access_token(data={"sub": user.email, "role": "admin"})
    return {"access_token": access_token, "token_type": "bearer", "role": "admin"}

@router.post("/driver-login")
async def driver_login(req: DriverLoginRequest, db: AsyncSession = Depends(get_db)):
    """
    Dedicated Driver Login via Gmail/Phone + PIN.
    """
    # Check if email is valid
    result = await db.execute(select(User).where(User.email == req.email).where(User.role == "driver"))
    user = result.scalar_one_or_none()
    
    if not user or user.pin != req.pin:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials or PIN",
        )
    
    access_token = create_access_token(data={"sub": user.email, "role": "driver", "vehicle_id": user.vehicle_id})
    return {
        "access_token": access_token, 
        "token_type": "bearer", 
        "role": "driver",
        "vehicle_id": user.vehicle_id
    }

@router.get("/me")
async def read_users_me(current_user_email: str = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """
    Returns the current user's profile and roles from the DB.
    """
    result = await db.execute(select(User).where(User.email == current_user_email))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return {
        "id": user.id,
        "email": user.email,
        "role": user.role,
        "vehicle_id": user.vehicle_id,
        "is_active": user.is_active
    }
