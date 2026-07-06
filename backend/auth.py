import os
import hashlib
import secrets
import datetime
import jwt

SECRET_KEY = os.getenv("JWT_SECRET")
if not SECRET_KEY:
    if os.getenv("ENV") == "production":
        raise RuntimeError("CRITICAL SECURITY ERROR: JWT_SECRET environment variable is not set in production!")
    SECRET_KEY = "fallback-local-only-insecure-key-for-habitring"

ALGORITHM = "HS256"

def hash_password(password: str) -> str:
    """Hash a password using PBKDF2 HMAC SHA-256 with a random salt."""
    salt = secrets.token_hex(16)
    pwd_bytes = password.encode('utf-8')
    salt_bytes = salt.encode('utf-8')
    dk = hashlib.pbkdf2_hmac('sha256', pwd_bytes, salt_bytes, 100000)
    hash_hex = dk.hex()
    return f"{salt}:{hash_hex}"

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plain password against the stored salt and hash."""
    try:
        salt, stored_hash = hashed_password.split(':')
        pwd_bytes = plain_password.encode('utf-8')
        salt_bytes = salt.encode('utf-8')
        dk = hashlib.pbkdf2_hmac('sha256', pwd_bytes, salt_bytes, 100000)
        return dk.hex() == stored_hash
    except Exception:
        return False

def create_access_token(data: dict, expires_delta: datetime.timedelta = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.datetime.utcnow() + expires_delta
    else:
        # Enforce 8-hour token lifetime as per production security audit
        expire = datetime.datetime.utcnow() + datetime.timedelta(hours=8)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def decode_access_token(token: str):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except jwt.PyJWTError:
        return None

def validate_password_strength(password: str) -> None:
    """Validate that password meets security complexity rules."""
    if len(password) < 8:
        raise ValueError("Password must be at least 8 characters long.")
    if not any(c.isupper() for c in password):
        raise ValueError("Password must contain at least one uppercase letter.")
    if not any(c.islower() for c in password):
        raise ValueError("Password must contain at least one lowercase letter.")
    if not any(c.isdigit() for c in password):
        raise ValueError("Password must contain at least one digit.")
    special_chars = "!@#$%^&*()-_=+[]{}|;:',.<>?/~`"
    if not any(c in special_chars for c in password):
        raise ValueError("Password must contain at least one special character.")
