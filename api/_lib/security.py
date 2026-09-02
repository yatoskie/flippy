"""
FLIPPY API — Security helpers
================================
Password hashing (PBKDF2-SHA256), OTP generation/verification, and signed
session tokens. Deliberately stdlib-only (hashlib/hmac/secrets) — no bcrypt/
PyJWT — so this installs cleanly on Vercel's Python serverless runtime with
zero compiled-dependency risk.
"""

import os
import hmac
import hashlib
import secrets
import base64
import json
import time

PBKDF2_ITERATIONS = 200_000
TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7  # 7 days


def _get_secret():
    secret = os.environ.get("APP_SECRET")
    if not secret:
        # Fails loudly in production rather than silently using a weak
        # default — set APP_SECRET in your environment variables.
        raise RuntimeError("APP_SECRET environment variable is not set.")
    return secret.encode()


# --------------------------------- Passwords --------------------------------

def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, PBKDF2_ITERATIONS)
    return f"{salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        salt_hex, digest_hex = stored.split("$")
    except ValueError:
        return False
    salt = bytes.fromhex(salt_hex)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, PBKDF2_ITERATIONS)
    return hmac.compare_digest(digest.hex(), digest_hex)


# ------------------------------------ OTP ------------------------------------

def generate_otp() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def hash_otp(code: str) -> str:
    return hashlib.sha256(code.encode()).hexdigest()


def verify_otp(code: str, stored_hash: str) -> bool:
    return hmac.compare_digest(hash_otp(code), stored_hash)


# ---------------------------------- Tokens -----------------------------------
# Lightweight signed session tokens (HMAC-SHA256 over a JSON payload),
# functionally equivalent to a minimal JWT — avoids adding PyJWT as a
# dependency for a single, simple use case.

def create_token(user_id: int) -> str:
    payload = {"uid": user_id, "exp": int(time.time()) + TOKEN_TTL_SECONDS}
    payload_b64 = base64.urlsafe_b64encode(json.dumps(payload).encode()).rstrip(b"=")
    sig = hmac.new(_get_secret(), payload_b64, hashlib.sha256).digest()
    sig_b64 = base64.urlsafe_b64encode(sig).rstrip(b"=")
    return f"{payload_b64.decode()}.{sig_b64.decode()}"


def verify_token(token: str):
    """Returns user_id (int) if valid, else None."""
    try:
        payload_b64, sig_b64 = token.split(".")
        expected_sig = hmac.new(_get_secret(), payload_b64.encode(), hashlib.sha256).digest()
        expected_sig_b64 = base64.urlsafe_b64encode(expected_sig).rstrip(b"=").decode()
        if not hmac.compare_digest(sig_b64, expected_sig_b64):
            return None
        padded = payload_b64 + "=" * (-len(payload_b64) % 4)
        payload = json.loads(base64.urlsafe_b64decode(padded))
        if payload.get("exp", 0) < time.time():
            return None
        return payload.get("uid")
    except Exception:
        return None


def get_bearer_user_id(headers: dict):
    """Extracts and verifies the Authorization: Bearer <token> header."""
    auth = headers.get("Authorization") or headers.get("authorization") or ""
    if not auth.startswith("Bearer "):
        return None
    return verify_token(auth[7:].strip())
