from passlib.context import CryptContext
from jose import jwt
from datetime import datetime, timedelta
from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from .config import settings
from .db import get_db
from . import models
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm, HTTPBearer
from fastapi import Depends

pwd = CryptContext(schemes=["argon2"], deprecated="auto")


oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/token")

def hash_password(p: str) -> str:
    # bcrypt hard limit: 72 bytes
    b = p.encode("utf-8")
    if len(b) > 72:
        raise ValueError("Password too long (bcrypt max 72 bytes). Use <=72 bytes.")
    return pwd.hash(p)

def verify_password(p: str, hashed: str) -> bool:
    b = p.encode("utf-8")
    if len(b) > 72:
        return False
    return pwd.verify(p, hashed)

def create_access_token(user_id: int) -> str:
    exp = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_MINUTES)
    payload = {"sub": str(user_id), "exp": exp}
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALG)

def create_refresh_token(user_id: int) -> str:
    exp = datetime.utcnow() + timedelta(days=7)  # 7 days
    payload = {"sub": str(user_id), "exp": exp, "type": "refresh"}
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALG)

def get_current_user(db: Session = Depends(get_db), token: str = Depends(oauth2_scheme)) -> models.User:
    print(f"[DEBUG] Received token: {token[:20]}..." if token else "[DEBUG] No token received")
    if not token:
        raise HTTPException(status_code=401, detail="Invalid token")
    
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALG])
        uid = int(payload["sub"])
        print(f"[DEBUG] Decoded user ID: {uid}")
    except Exception as e:
        print(f"[DEBUG] Token decode error: {e}")
        raise HTTPException(status_code=401, detail="Invalid token")

    user = db.query(models.User).filter(models.User.id == uid).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user