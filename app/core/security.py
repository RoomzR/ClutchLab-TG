"""Password hashing, JWT issuing/verification (HS256 or RS256), opaque token helpers."""

import logging
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
import jwt

from config import settings

logger = logging.getLogger(__name__)

# --- JWT key material ---
# RS256: keys are loaded from PEM files (auto-generated on first start).
# HS256: shared secret from settings. Selected via JWT_ALGORITHM.

_signing_key: str | bytes = settings.jwt_secret
_verify_key: str | bytes = settings.jwt_secret


def _init_rs256_keys() -> None:
    global _signing_key, _verify_key
    priv_path = settings.jwt_private_key_path
    pub_path = settings.jwt_public_key_path

    if not (os.path.exists(priv_path) and os.path.exists(pub_path)):
        from cryptography.hazmat.primitives import serialization
        from cryptography.hazmat.primitives.asymmetric import rsa

        key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        with open(priv_path, "wb") as f:
            f.write(
                key.private_bytes(
                    serialization.Encoding.PEM,
                    serialization.PrivateFormat.PKCS8,
                    serialization.NoEncryption(),
                )
            )
        os.chmod(priv_path, 0o600)
        with open(pub_path, "wb") as f:
            f.write(
                key.public_key().public_bytes(
                    serialization.Encoding.PEM,
                    serialization.PublicFormat.SubjectPublicKeyInfo,
                )
            )
        logger.info("Generated new RS256 keypair for JWT signing")

    with open(priv_path, "rb") as f:
        _signing_key = f.read()
    with open(pub_path, "rb") as f:
        _verify_key = f.read()
    logger.info("JWT: RS256 keys loaded")


if settings.jwt_algorithm == "RS256":
    try:
        _init_rs256_keys()
    except Exception as exc:
        logger.error("RS256 init failed (%s); falling back to HS256", exc)
        settings.jwt_algorithm = "HS256"


# --- Passwords (bcrypt) ---

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except (ValueError, TypeError):
        return False


# --- JWT access tokens ---

def create_access_token(user_id: str, role: str, permissions: list[str]) -> str:
    now = datetime.now(timezone.utc)
    payload: dict[str, Any] = {
        "sub": user_id,
        "role": role,
        "permissions": permissions,
        "iat": now,
        "exp": now + timedelta(minutes=settings.access_token_minutes),
        "type": "access",
    }
    return jwt.encode(payload, _signing_key, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict[str, Any] | None:
    try:
        payload = jwt.decode(token, _verify_key, algorithms=[settings.jwt_algorithm])
    except jwt.PyJWTError:
        return None
    if payload.get("type") != "access":
        return None
    return payload


def create_pending_2fa_token(user_id: str) -> str:
    """Short-lived token bridging password check → TOTP verification."""
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "iat": now,
        "exp": now + timedelta(minutes=5),
        "type": "pending_2fa",
    }
    return jwt.encode(payload, _signing_key, algorithm=settings.jwt_algorithm)


def decode_pending_2fa_token(token: str) -> str | None:
    try:
        payload = jwt.decode(token, _verify_key, algorithms=[settings.jwt_algorithm])
    except jwt.PyJWTError:
        return None
    if payload.get("type") != "pending_2fa":
        return None
    return payload.get("sub")


# --- Opaque tokens (refresh, email verification, password reset) ---

def generate_opaque_token() -> str:
    return secrets.token_urlsafe(48)


def refresh_token_expiry() -> datetime:
    return datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_days)


def short_token_expiry(hours: int = 24) -> datetime:
    return datetime.now(timezone.utc) + timedelta(hours=hours)
