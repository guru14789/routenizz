from datetime import datetime, timedelta, timezone
from typing import Optional
from jose import JWTError, jwt
import bcrypt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from app.core.config import config
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db.database import get_db
from app.models.db_models import User
from firebase_admin import auth as firebase_auth
from app.core.logger import logger

# Direct bcrypt hashing (avoiding passlib bug on 3.12+)
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/v1/auth/login")

def verify_password(plain_password: str, hashed_password: str):
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))

def get_password_hash(password: str):
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        # Use config value, default to 30 if not set, fallback to 15 if config missing
        expire_mins = getattr(config, "ACCESS_TOKEN_EXPIRE_MINUTES", 30)
        expire = datetime.now(timezone.utc) + timedelta(minutes=expire_mins)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, config.SECRET_KEY, algorithm=config.ALGORITHM)
    return encoded_jwt


def decode_access_token(token: str) -> dict:
    """
    Decode and validate a JWT token, returning the raw payload dict.
    Raises HTTPException 401 on invalid/expired tokens.
    Used by the /refresh endpoint to inspect the existing token's claims.
    """
    try:
        payload = jwt.decode(token, config.SECRET_KEY, algorithms=[config.ALGORITHM])
        return payload
    except JWTError as e:
        logger.error(f"[AUTH] decode_access_token failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token invalid or expired",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def verify_firebase_token(token: str):
    """
    Verifies a Firebase ID Token using the Admin SDK.
    Returns the user's UID and decoded payload.
    """
    try:
        # Note: In production, ensure firebase_admin is initialized (handled in lifespan)
        decoded_token = firebase_auth.verify_id_token(token)
        return decoded_token
    except Exception as e:
        logger.error(f"[AUTH] Firebase token verification failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid or expired Firebase token: {str(e)}",
            headers={"WWW-Authenticate": "Bearer"},
        )

async def get_current_user(token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        logger.debug(f"[AUTH] Attempting to decode token: {token[:10]}...")
        payload = jwt.decode(token, config.SECRET_KEY, algorithms=[config.ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            logger.warning("[AUTH] Token payload missing 'sub' claim")
            raise credentials_exception
        logger.info(f"[AUTH] Successfully validated user: {username}")
        return username
    except JWTError as e:
        logger.error(f"[AUTH] JWT decoding failed: {e}")
        raise credentials_exception

async def require_admin(token: str = Depends(oauth2_scheme), db: AsyncSession = Depends(get_db)):
    """
    Dependency that ensures the requester is an authenticated Admin.
    Replaces the Firebase-based require_admin for unified SQLite-backed auth.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        logger.warning(f"[AUTH] require_admin: Validating token...")
        payload = jwt.decode(token, config.SECRET_KEY, algorithms=[config.ALGORITHM])
        email: str = payload.get("sub")
        role: str = payload.get("role")
        
        if email is None:
            logger.error("[AUTH] require_admin: Email (sub) is missing in token")
            raise credentials_exception
            
        if role != "admin":
            logger.warning(f"[AUTH] require_admin: User {email} has role {role}, not admin")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Admin privileges required"
            )
            
        # Verify user still exists and is active in the database
        result = await db.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()
        
        if not user:
            logger.warning(f"[AUTH] require_admin: User {email} not found in database")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied. User not found."
            )
            
        if user.role != "admin":
            logger.warning(f"[AUTH] require_admin: Database role for {email} is '{user.role}', expected 'admin'")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied. User is not an administrator."
            )
            
        if not user.is_active:
            logger.warning(f"[AUTH] require_admin: User {email} is inactive")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied. User account is inactive."
            )
            
        logger.info(f"[AUTH] require_admin: Authorized admin: {email}")
        return {"email": email, "role": "admin", "id": user.id}
    except JWTError as e:
        logger.error(f"[AUTH] require_admin: JWT validation failed: {e}")
        raise credentials_exception
