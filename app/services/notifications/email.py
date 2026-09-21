"""Transactional email via Resend HTTP API. Logs to console when no API key is set."""

import logging

import httpx

from config import settings

logger = logging.getLogger(__name__)

RESEND_URL = "https://api.resend.com/emails"

_BASE_STYLE = (
    "font-family:Inter,Arial,sans-serif;background:#0f172a;color:#e2e8f0;"
    "padding:32px;border-radius:12px;max-width:560px;margin:0 auto"
)
_BTN_STYLE = (
    "display:inline-block;background:#06b6d4;color:#0f172a;font-weight:700;"
    "padding:12px 28px;border-radius:10px;text-decoration:none;margin:16px 0"
)


def _wrap(title: str, body_html: str) -> str:
    return f"""
    <div style="background:#020617;padding:24px">
      <div style="{_BASE_STYLE}">
        <h1 style="color:#22d3ee;font-size:22px;margin:0 0 16px">{title}</h1>
        {body_html}
        <p style="color:#64748b;font-size:12px;margin-top:32px">
          ClutchLab — CS2 Demo Intelligence
        </p>
      </div>
    </div>
    """


async def _send(to: str, subject: str, html: str) -> bool:
    if not settings.resend_api_key:
        logger.info("[EMAIL:console] to=%s subject=%r (Resend API key not configured)", to, subject)
        return True
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(
                RESEND_URL,
                headers={"Authorization": f"Bearer {settings.resend_api_key}"},
                json={
                    "from": settings.email_from,
                    "to": [to],
                    "subject": subject,
                    "html": html,
                },
            )
        if response.status_code >= 400:
            logger.error("Resend error %s: %s", response.status_code, response.text)
            return False
        return True
    except Exception as exc:
        logger.error("Email send failed: %s", exc)
        return False


async def send_verification_email(to: str, username: str, token: str) -> bool:
    link = f"{settings.frontend_base_url}/verify-email/{token}"
    html = _wrap(
        "Verify your email",
        f"""
        <p>Hey {username},</p>
        <p>Welcome to ClutchLab! Confirm your email address to unlock all features.</p>
        <a href="{link}" style="{_BTN_STYLE}">Verify Email</a>
        <p style="color:#94a3b8;font-size:13px">This link expires in 24 hours.
        If you didn't create an account, you can safely ignore this email.</p>
        """,
    )
    return await _send(to, "Verify your email — ClutchLab", html)


async def send_password_reset_email(to: str, username: str, token: str) -> bool:
    link = f"{settings.frontend_base_url}/reset-password/{token}"
    html = _wrap(
        "Reset your password",
        f"""
        <p>Hey {username},</p>
        <p>We received a request to reset your password. Click below to set a new one.</p>
        <a href="{link}" style="{_BTN_STYLE}">Reset Password</a>
        <p style="color:#94a3b8;font-size:13px">This link expires in 2 hours.
        If you didn't request a reset, ignore this email — your password stays unchanged.</p>
        """,
    )
    return await _send(to, "Reset your password — ClutchLab", html)


async def send_welcome_email(to: str, username: str) -> bool:
    html = _wrap(
        "Welcome to ClutchLab!",
        f"""
        <p>Hey {username},</p>
        <p>Your account is ready. Here's how to get the most out of the platform:</p>
        <ol style="color:#cbd5e1;line-height:1.8">
          <li>Upload your first .dem file from the dashboard</li>
          <li>Explore the 2D replay, heatmaps and grenade analysis</li>
          <li>Check player habits and anti-strat reports</li>
        </ol>
        <a href="{settings.frontend_base_url}/dashboard" style="{_BTN_STYLE}">Open Dashboard</a>
        <p style="color:#94a3b8;font-size:13px">Your 7-day free Pro trial is active — no card required.</p>
        """,
    )
    return await _send(to, "Welcome to ClutchLab 🎯", html)


async def send_subscription_confirmation(to: str, username: str, plan: str) -> bool:
    html = _wrap(
        "Subscription confirmed",
        f"""
        <p>Hey {username},</p>
        <p>Your <strong style="color:#22d3ee">{plan}</strong> subscription is now active.
        Thanks for supporting ClutchLab!</p>
        <a href="{settings.frontend_base_url}/billing" style="{_BTN_STYLE}">Manage Subscription</a>
        """,
    )
    return await _send(to, f"{plan} subscription activated — ClutchLab", html)


async def send_payment_failed(to: str, username: str) -> bool:
    html = _wrap(
        "Payment failed",
        f"""
        <p>Hey {username},</p>
        <p>We couldn't process your latest payment. Please update your payment method
        to keep your subscription active.</p>
        <a href="{settings.frontend_base_url}/billing" style="{_BTN_STYLE}">Update Payment Method</a>
        """,
    )
    return await _send(to, "Action required: payment failed — ClutchLab", html)


async def send_referral_bonus(to: str, username: str, bonus: str) -> bool:
    html = _wrap(
        "You earned a referral bonus!",
        f"""
        <p>Hey {username},</p>
        <p>Someone joined ClutchLab using your referral link. You earned:
        <strong style="color:#22d3ee">{bonus}</strong> 🎉</p>
        <a href="{settings.frontend_base_url}/dashboard" style="{_BTN_STYLE}">Open Dashboard</a>
        """,
    )
    return await _send(to, "Referral bonus earned — ClutchLab", html)
