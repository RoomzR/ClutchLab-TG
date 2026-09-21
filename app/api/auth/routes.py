"""Auth endpoints: register, login, refresh, logout, email verification, password reset, profile."""

import logging
import re
import secrets
import urllib.parse
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field

from config import settings
from email_service import (
    send_password_reset_email,
    send_verification_email,
    send_welcome_email,
)
from gamification import (
    XP_PER_REFERRAL_SIGNUP,
    award_xp,
    check_referral_achievements,
    grant_achievement,
    level_progress,
)
from permissions import (
    AuthUser,
    get_current_user,
    limits_for_role,
    permissions_for_role,
)
from postgres_repo import execute, fetch, fetchrow
from rate_limit import (
    check_rate_limit,
    clear_login_failures,
    is_login_locked,
    register_login_failure,
)
from security import (
    create_access_token,
    create_pending_2fa_token,
    decode_pending_2fa_token,
    generate_opaque_token,
    hash_password,
    refresh_token_expiry,
    short_token_expiry,
    verify_password,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["auth"])

USERNAME_RE = re.compile(r"^[a-zA-Z0-9_\-]{3,24}$")


# ---------- Schemas ----------

class RegisterRequest(BaseModel):
    email: EmailStr
    username: str = Field(min_length=3, max_length=24)
    password: str = Field(min_length=8, max_length=128)
    referral_code: str | None = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    password: str = Field(min_length=8, max_length=128)


class UpdateProfileRequest(BaseModel):
    username: str | None = Field(default=None, min_length=3, max_length=24)
    avatar_url: str | None = Field(default=None, max_length=500)


class LinkSteamRequest(BaseModel):
    """Params returned by Steam OpenID to the frontend callback."""
    openid_params: dict[str, str]


class TotpCodeRequest(BaseModel):
    code: str = Field(min_length=6, max_length=6)


class TwoFaVerifyRequest(BaseModel):
    pending_token: str
    code: str = Field(min_length=6, max_length=6)


class DiscordWebhookRequest(BaseModel):
    webhook_url: str | None = Field(default=None, max_length=400)


# ---------- Helpers ----------

def _user_public(row) -> dict:
    role = row["role"]
    limits = limits_for_role(role)
    xp = int(row["xp"]) if "xp" in row.keys() and row["xp"] is not None else 0
    return {
        "id": str(row["id"]),
        "email": row["email"],
        "username": row["username"],
        "avatar_url": row["avatar_url"],
        "steam_id": row["steam_id"],
        "role": role,
        "is_verified": row["is_verified"],
        "totp_enabled": bool(row["totp_enabled"]) if "totp_enabled" in row.keys() else False,
        "discord_webhook_url": row["discord_webhook_url"] if "discord_webhook_url" in row.keys() else None,
        "created_at": row["created_at"].isoformat() if row["created_at"] else None,
        "permissions": permissions_for_role(role),
        "limits": limits,
        "gamification": level_progress(xp),
    }


async def _issue_tokens(user_row, request: Request) -> dict:
    role = user_row["role"]
    access = create_access_token(
        str(user_row["id"]), role, permissions_for_role(role),
    )
    refresh = generate_opaque_token()
    await execute(
        "INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)",
        user_row["id"], refresh, refresh_token_expiry(),
    )
    ip = request.headers.get("x-forwarded-for", "").split(",")[0].strip() or (
        request.client.host if request.client else None
    )
    await execute(
        "INSERT INTO user_sessions (user_id, ip, user_agent) VALUES ($1, $2, $3)",
        user_row["id"], ip, request.headers.get("user-agent", "")[:500],
    )
    return {
        "access_token": access,
        "refresh_token": refresh,
        "token_type": "bearer",
        "expires_in": settings.access_token_minutes * 60,
        "user": _user_public(user_row),
    }


async def _grant_referral_signup_bonus(referral_code: str, new_user_id) -> None:
    ref = await fetchrow(
        "SELECT rc.id, rc.user_id FROM referral_codes rc WHERE rc.code = $1",
        referral_code.strip().upper(),
    )
    if not ref or str(ref["user_id"]) == str(new_user_id):
        return
    await execute("UPDATE referral_codes SET uses = uses + 1 WHERE id = $1", ref["id"])
    await execute(
        """
        INSERT INTO referral_rewards (referrer_id, referred_id, reward_type)
        VALUES ($1, $2, 'signup_demos')
        ON CONFLICT DO NOTHING
        """,
        ref["user_id"], new_user_id,
    )
    await execute(
        "INSERT INTO demo_bonuses (user_id, amount, reason) VALUES ($1, 5, 'referral_signup')",
        ref["user_id"],
    )
    referrer_id = str(ref["user_id"])
    await award_xp(referrer_id, XP_PER_REFERRAL_SIGNUP, "referral_signup")
    await check_referral_achievements(referrer_id)


# ---------- Endpoints ----------

@router.post("/register")
async def register(body: RegisterRequest, request: Request):
    await check_rate_limit(request, "auth")

    if not USERNAME_RE.match(body.username):
        raise HTTPException(
            status_code=422,
            detail="Username must be 3-24 characters: letters, digits, _ or -",
        )

    email = body.email.lower()
    existing = await fetchrow(
        "SELECT id FROM users WHERE email = $1 OR username = $2", email, body.username,
    )
    if existing:
        raise HTTPException(status_code=409, detail="Email or username already taken")

    admin_emails = {e.strip().lower() for e in settings.admin_emails.split(",") if e.strip()}
    initial_role = "ADMIN" if email in admin_emails else "FREE"

    user = await fetchrow(
        """
        INSERT INTO users (email, username, password_hash, role)
        VALUES ($1, $2, $3, $4)
        RETURNING *
        """,
        email, body.username, hash_password(body.password), initial_role,
    )

    if initial_role == "FREE":
        # 7-day PRO trial without card
        now = datetime.now(timezone.utc)
        trial_end = now + timedelta(days=settings.trial_days)
        await execute(
            """
            INSERT INTO subscriptions (user_id, plan_type, status, billing_interval,
                                       current_period_start, current_period_end)
            VALUES ($1, 'PRO', 'trialing', 'trial', $2, $3)
            """,
            user["id"], now, trial_end,
        )
        await execute("UPDATE users SET role = 'PRO' WHERE id = $1", user["id"])
        user = await fetchrow("SELECT * FROM users WHERE id = $1", user["id"])

    verify_token = generate_opaque_token()
    await execute(
        "INSERT INTO email_verifications (user_id, token, expires_at) VALUES ($1, $2, $3)",
        user["id"], verify_token, short_token_expiry(24),
    )
    await send_verification_email(email, body.username, verify_token)
    await send_welcome_email(email, body.username)

    if body.referral_code:
        try:
            await _grant_referral_signup_bonus(body.referral_code, user["id"])
        except Exception as exc:
            logger.warning("Referral bonus failed: %s", exc)

    return await _issue_tokens(user, request)


@router.post("/login")
async def login(body: LoginRequest, request: Request):
    await check_rate_limit(request, "auth")
    email = body.email.lower()

    if await is_login_locked(email):
        raise HTTPException(
            status_code=423,
            detail=f"Too many failed attempts. Try again in {settings.login_lockout_minutes} minutes.",
        )

    user = await fetchrow("SELECT * FROM users WHERE email = $1", email)
    if not user or not verify_password(body.password, user["password_hash"]):
        await register_login_failure(email)
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user["is_active"]:
        raise HTTPException(status_code=403, detail="Account is deactivated")

    await clear_login_failures(email)

    if user["totp_enabled"]:
        return {
            "requires_2fa": True,
            "pending_token": create_pending_2fa_token(str(user["id"])),
        }

    await execute("UPDATE users SET last_login_at = NOW() WHERE id = $1", user["id"])
    return await _issue_tokens(user, request)


@router.post("/2fa/verify")
async def two_fa_verify(body: TwoFaVerifyRequest, request: Request):
    """Second login step: exchange pending token + TOTP code for real tokens."""
    await check_rate_limit(request, "auth")
    user_id = decode_pending_2fa_token(body.pending_token)
    if not user_id:
        raise HTTPException(status_code=401, detail="2FA session expired, log in again")

    user = await fetchrow("SELECT * FROM users WHERE id = $1::uuid", user_id)
    if not user or not user["totp_enabled"] or not user["totp_secret"]:
        raise HTTPException(status_code=401, detail="2FA is not enabled for this account")

    import pyotp

    if not pyotp.TOTP(user["totp_secret"]).verify(body.code, valid_window=1):
        raise HTTPException(status_code=401, detail="Invalid 2FA code")

    await execute("UPDATE users SET last_login_at = NOW() WHERE id = $1", user["id"])
    return await _issue_tokens(user, request)


@router.post("/2fa/setup")
async def two_fa_setup(user: AuthUser = Depends(get_current_user)):
    """Generate a TOTP secret; user confirms with /2fa/enable."""
    import pyotp

    row = await fetchrow("SELECT email, totp_enabled FROM users WHERE id = $1::uuid", user.id)
    if row["totp_enabled"]:
        raise HTTPException(status_code=400, detail="2FA is already enabled")

    secret = pyotp.random_base32()
    await execute(
        "UPDATE users SET totp_secret = $2, updated_at = NOW() WHERE id = $1::uuid",
        user.id, secret,
    )
    uri = pyotp.totp.TOTP(secret).provisioning_uri(
        name=row["email"], issuer_name="ClutchLab",
    )
    return {"secret": secret, "otpauth_uri": uri}


@router.post("/2fa/enable")
async def two_fa_enable(body: TotpCodeRequest, user: AuthUser = Depends(get_current_user)):
    import pyotp

    row = await fetchrow(
        "SELECT totp_secret, totp_enabled FROM users WHERE id = $1::uuid", user.id,
    )
    if row["totp_enabled"]:
        raise HTTPException(status_code=400, detail="2FA is already enabled")
    if not row["totp_secret"]:
        raise HTTPException(status_code=400, detail="Run 2FA setup first")
    if not pyotp.TOTP(row["totp_secret"]).verify(body.code, valid_window=1):
        raise HTTPException(status_code=400, detail="Invalid code — check your authenticator app")

    await execute(
        "UPDATE users SET totp_enabled = TRUE, updated_at = NOW() WHERE id = $1::uuid", user.id,
    )
    return {"detail": "Two-factor authentication enabled"}


@router.post("/2fa/disable")
async def two_fa_disable(body: TotpCodeRequest, user: AuthUser = Depends(get_current_user)):
    import pyotp

    row = await fetchrow(
        "SELECT totp_secret, totp_enabled FROM users WHERE id = $1::uuid", user.id,
    )
    if not row["totp_enabled"] or not row["totp_secret"]:
        raise HTTPException(status_code=400, detail="2FA is not enabled")
    if not pyotp.TOTP(row["totp_secret"]).verify(body.code, valid_window=1):
        raise HTTPException(status_code=400, detail="Invalid code")

    await execute(
        """
        UPDATE users SET totp_enabled = FALSE, totp_secret = NULL, updated_at = NOW()
        WHERE id = $1::uuid
        """,
        user.id,
    )
    return {"detail": "Two-factor authentication disabled"}


@router.put("/discord-webhook")
async def set_discord_webhook(
    body: DiscordWebhookRequest, user: AuthUser = Depends(get_current_user),
):
    url = (body.webhook_url or "").strip() or None
    if url and not url.startswith("https://discord.com/api/webhooks/"):
        raise HTTPException(
            status_code=422,
            detail="Webhook URL must start with https://discord.com/api/webhooks/",
        )
    await execute(
        "UPDATE users SET discord_webhook_url = $2, updated_at = NOW() WHERE id = $1::uuid",
        user.id, url,
    )
    return {"detail": "Discord webhook saved" if url else "Discord webhook removed"}


@router.post("/refresh")
async def refresh(body: RefreshRequest, request: Request):
    await check_rate_limit(request, "auth")

    row = await fetchrow(
        """
        SELECT rt.*, u.role, u.is_active FROM refresh_tokens rt
        JOIN users u ON u.id = rt.user_id
        WHERE rt.token = $1
        """,
        body.refresh_token,
    )
    if not row or row["revoked"]:
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    if row["expires_at"] < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Refresh token expired")
    if not row["is_active"]:
        raise HTTPException(status_code=403, detail="Account is deactivated")

    # Rotation: revoke old, issue new
    await execute("UPDATE refresh_tokens SET revoked = TRUE WHERE id = $1", row["id"])
    user = await fetchrow("SELECT * FROM users WHERE id = $1", row["user_id"])
    return await _issue_tokens(user, request)


@router.post("/logout")
async def logout(body: RefreshRequest):
    await execute(
        "UPDATE refresh_tokens SET revoked = TRUE WHERE token = $1", body.refresh_token,
    )
    return {"detail": "Logged out"}


@router.get("/verify-email/{token}")
async def verify_email(token: str):
    row = await fetchrow(
        "SELECT * FROM email_verifications WHERE token = $1", token,
    )
    if not row or row["used_at"] is not None:
        raise HTTPException(status_code=400, detail="Invalid or already used verification link")
    if row["expires_at"] < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Verification link expired")

    await execute("UPDATE email_verifications SET used_at = NOW() WHERE id = $1", row["id"])
    await execute("UPDATE users SET is_verified = TRUE WHERE id = $1", row["user_id"])
    await grant_achievement(str(row["user_id"]), "verified")
    return {"detail": "Email verified successfully"}


@router.post("/forgot-password")
async def forgot_password(body: ForgotPasswordRequest, request: Request):
    await check_rate_limit(request, "auth")
    user = await fetchrow("SELECT * FROM users WHERE email = $1", body.email.lower())
    # Always return 200 to avoid email enumeration
    if user:
        token = generate_opaque_token()
        await execute(
            "INSERT INTO password_resets (user_id, token, expires_at) VALUES ($1, $2, $3)",
            user["id"], token, short_token_expiry(2),
        )
        await send_password_reset_email(user["email"], user["username"], token)
    return {"detail": "If that email exists, a reset link has been sent"}


@router.post("/reset-password/{token}")
async def reset_password(token: str, body: ResetPasswordRequest, request: Request):
    await check_rate_limit(request, "auth")
    row = await fetchrow("SELECT * FROM password_resets WHERE token = $1", token)
    if not row or row["used_at"] is not None:
        raise HTTPException(status_code=400, detail="Invalid or already used reset link")
    if row["expires_at"] < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Reset link expired")

    await execute("UPDATE password_resets SET used_at = NOW() WHERE id = $1", row["id"])
    await execute(
        "UPDATE users SET password_hash = $2, updated_at = NOW() WHERE id = $1",
        row["user_id"], hash_password(body.password),
    )
    # Revoke all refresh tokens (force re-login everywhere)
    await execute(
        "UPDATE refresh_tokens SET revoked = TRUE WHERE user_id = $1", row["user_id"],
    )
    return {"detail": "Password updated. Please log in with your new password."}


@router.get("/me")
async def me(user: AuthUser = Depends(get_current_user)):
    row = await fetchrow("SELECT * FROM users WHERE id = $1::uuid", user.id)
    if not row:
        raise HTTPException(status_code=404, detail="User not found")
    return _user_public(row)


@router.patch("/me")
async def update_me(body: UpdateProfileRequest, user: AuthUser = Depends(get_current_user)):
    if body.username is not None:
        if not USERNAME_RE.match(body.username):
            raise HTTPException(
                status_code=422,
                detail="Username must be 3-24 characters: letters, digits, _ or -",
            )
        taken = await fetchrow(
            "SELECT id FROM users WHERE username = $1 AND id != $2::uuid",
            body.username, user.id,
        )
        if taken:
            raise HTTPException(status_code=409, detail="Username already taken")
        await execute(
            "UPDATE users SET username = $2, updated_at = NOW() WHERE id = $1::uuid",
            user.id, body.username,
        )
    if body.avatar_url is not None:
        await execute(
            "UPDATE users SET avatar_url = $2, updated_at = NOW() WHERE id = $1::uuid",
            user.id, body.avatar_url,
        )
    row = await fetchrow("SELECT * FROM users WHERE id = $1::uuid", user.id)
    return _user_public(row)


@router.get("/sessions")
async def list_sessions(user: AuthUser = Depends(get_current_user)):
    rows = await fetch(
        """
        SELECT id, ip, user_agent, created_at, last_activity
        FROM user_sessions WHERE user_id = $1::uuid
        ORDER BY last_activity DESC LIMIT 20
        """,
        user.id,
    )
    return [
        {
            "id": str(r["id"]),
            "ip": r["ip"],
            "user_agent": r["user_agent"],
            "created_at": r["created_at"].isoformat(),
            "last_activity": r["last_activity"].isoformat(),
        }
        for r in rows
    ]


# ---------- Steam OpenID ----------

STEAM_OPENID_URL = "https://steamcommunity.com/openid/login"


@router.get("/steam/authorize-url")
async def steam_authorize_url(user: AuthUser = Depends(get_current_user)):
    """Build the Steam OpenID redirect URL; frontend sends the user there."""
    return_to = f"{settings.frontend_base_url}/settings?steam_callback=1"
    params = {
        "openid.ns": "http://specs.openid.net/auth/2.0",
        "openid.mode": "checkid_setup",
        "openid.return_to": return_to,
        "openid.realm": settings.frontend_base_url,
        "openid.identity": "http://specs.openid.net/auth/2.0/identifier_select",
        "openid.claimed_id": "http://specs.openid.net/auth/2.0/identifier_select",
    }
    return {"url": f"{STEAM_OPENID_URL}?{urllib.parse.urlencode(params)}"}


@router.post("/link-steam")
async def link_steam(body: LinkSteamRequest, user: AuthUser = Depends(get_current_user)):
    """Verify Steam OpenID response server-side and store steam_id."""
    params = dict(body.openid_params)
    claimed_id = params.get("openid.claimed_id", "")
    match = re.search(r"/openid/id/(\d{17})", claimed_id)
    if not match:
        raise HTTPException(status_code=400, detail="Invalid Steam OpenID response")

    params["openid.mode"] = "check_authentication"
    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.post(STEAM_OPENID_URL, data=params)
    if "is_valid:true" not in response.text:
        raise HTTPException(status_code=400, detail="Steam verification failed")

    steam_id = match.group(1)
    taken = await fetchrow(
        "SELECT id FROM users WHERE steam_id = $1 AND id != $2::uuid", steam_id, user.id,
    )
    if taken:
        raise HTTPException(status_code=409, detail="This Steam account is linked to another user")

    await execute(
        "UPDATE users SET steam_id = $2, updated_at = NOW() WHERE id = $1::uuid",
        user.id, steam_id,
    )
    await grant_achievement(user.id, "steam_linked")
    return {"detail": "Steam account linked", "steam_id": steam_id}


# ---------- Usage / quota info ----------

@router.get("/usage")
async def usage(user: AuthUser = Depends(get_current_user)):
    limits = limits_for_role(user.role)
    used_row = await fetchrow(
        """
        SELECT COUNT(*) AS used FROM demo_usage
        WHERE user_id = $1::uuid AND uploaded_at >= date_trunc('month', NOW())
        """,
        user.id,
    )
    bonus_row = await fetchrow(
        "SELECT COALESCE(SUM(amount), 0) AS bonus FROM demo_bonuses WHERE user_id = $1::uuid",
        user.id,
    )
    used = int(used_row["used"]) if used_row else 0
    bonus = int(bonus_row["bonus"]) if bonus_row else 0
    total = limits["max_demos"] + bonus
    return {
        "role": user.role,
        "demos_used_this_month": used,
        "demos_limit": total,
        "demos_remaining": max(0, total - used),
        "bonus_demos": bonus,
        "max_file_size_mb": limits["max_file_mb"],
    }
