"""Billing: plans, Stripe subscriptions, webhook, payments history, promo codes, referrals."""

import json
import logging
import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from config import settings
from email_service import (
    send_payment_failed,
    send_referral_bonus,
    send_subscription_confirmation,
)
from gamification import grant_achievement
from social import publish_activity
from permissions import AuthUser, get_current_user
from postgres_repo import execute, fetch, fetchrow
from rate_limit import check_rate_limit

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["billing"])

PAID_PLANS = {"PRO", "TEAM", "ORGANIZATION"}


def _stripe():
    """Return the configured stripe module or raise 503 when not configured."""
    if not settings.stripe_secret_key:
        raise HTTPException(
            status_code=503,
            detail="Payments are not configured yet (missing STRIPE_SECRET_KEY)",
        )
    import stripe

    stripe.api_key = settings.stripe_secret_key
    return stripe


def _price_id(plan: str, interval: str) -> str | None:
    mapping = {
        ("PRO", "monthly"): settings.stripe_price_pro_monthly,
        ("PRO", "yearly"): settings.stripe_price_pro_yearly,
        ("TEAM", "monthly"): settings.stripe_price_team_monthly,
        ("TEAM", "yearly"): settings.stripe_price_team_yearly,
        ("ORGANIZATION", "monthly"): settings.stripe_price_org_monthly,
        ("ORGANIZATION", "yearly"): settings.stripe_price_org_yearly,
    }
    return mapping.get((plan, interval)) or None


class SubscribeRequest(BaseModel):
    plan_type: str
    billing_interval: str = Field(default="monthly", pattern="^(monthly|yearly)$")
    promo_code: str | None = None


class PromoApplyRequest(BaseModel):
    code: str


# ---------- Plans ----------

@router.get("/plans")
async def list_plans():
    rows = await fetch("SELECT * FROM plans ORDER BY monthly_price")
    return [
        {
            "id": r["id"],
            "name": r["name"],
            "monthly_price": float(r["monthly_price"]),
            "yearly_price": float(r["yearly_price"]),
            "max_demos": r["max_demos"],
            "max_file_size_mb": r["max_file_size_mb"],
            "max_users": r["max_users"],
            "features": json.loads(r["features"]) if isinstance(r["features"], str) else r["features"],
        }
        for r in rows
    ]


# ---------- Subscription lifecycle ----------

async def _current_subscription(user_id: str):
    return await fetchrow(
        """
        SELECT * FROM subscriptions
        WHERE user_id = $1::uuid AND status IN ('active', 'trialing', 'past_due')
        ORDER BY created_at DESC LIMIT 1
        """,
        user_id,
    )


@router.get("/subscription/current")
async def current_subscription(user: AuthUser = Depends(get_current_user)):
    sub = await _current_subscription(user.id)
    if not sub:
        return {"plan_type": "FREE", "status": "none"}
    return {
        "id": str(sub["id"]),
        "plan_type": sub["plan_type"],
        "status": sub["status"],
        "billing_interval": sub["billing_interval"],
        "current_period_start": sub["current_period_start"].isoformat() if sub["current_period_start"] else None,
        "current_period_end": sub["current_period_end"].isoformat() if sub["current_period_end"] else None,
        "canceled_at": sub["canceled_at"].isoformat() if sub["canceled_at"] else None,
        "is_stripe": sub["stripe_subscription_id"] is not None,
    }


@router.post("/subscribe")
async def subscribe(body: SubscribeRequest, request: Request, user: AuthUser = Depends(get_current_user)):
    await check_rate_limit(request, "general")
    plan = body.plan_type.upper()
    if plan not in PAID_PLANS:
        raise HTTPException(status_code=422, detail=f"Unknown plan: {plan}")

    price_id = _price_id(plan, body.billing_interval)
    stripe = _stripe()
    if not price_id:
        raise HTTPException(
            status_code=503,
            detail=f"Stripe price for {plan}/{body.billing_interval} is not configured",
        )

    user_row = await fetchrow("SELECT * FROM users WHERE id = $1::uuid", user.id)

    # Reuse or create Stripe customer
    existing = await fetchrow(
        """
        SELECT stripe_customer_id FROM subscriptions
        WHERE user_id = $1::uuid AND stripe_customer_id IS NOT NULL
        ORDER BY created_at DESC LIMIT 1
        """,
        user.id,
    )
    if existing and existing["stripe_customer_id"]:
        customer_id = existing["stripe_customer_id"]
    else:
        customer = stripe.Customer.create(
            email=user_row["email"],
            name=user_row["username"],
            metadata={"user_id": user.id},
        )
        customer_id = customer.id

    discounts = []
    if body.promo_code:
        promo = await fetchrow(
            "SELECT * FROM promo_codes WHERE code = $1", body.promo_code.strip().upper(),
        )
        if promo and promo["current_uses"] < promo["max_uses"] and (
            promo["expires_at"] is None or promo["expires_at"] > datetime.now(timezone.utc)
        ):
            coupon = stripe.Coupon.create(
                percent_off=promo["discount_percent"],
                duration="once",
                name=f"PROMO {promo['code']}",
            )
            discounts = [{"coupon": coupon.id}]
            await execute(
                "UPDATE promo_codes SET current_uses = current_uses + 1 WHERE id = $1",
                promo["id"],
            )

    session = stripe.checkout.Session.create(
        customer=customer_id,
        mode="subscription",
        line_items=[{"price": price_id, "quantity": 1}],
        discounts=discounts,
        success_url=f"{settings.frontend_base_url}/billing?status=success",
        cancel_url=f"{settings.frontend_base_url}/billing?status=canceled",
        metadata={"user_id": user.id, "plan_type": plan, "interval": body.billing_interval},
    )
    return {"checkout_url": session.url}


@router.post("/subscription/cancel")
async def cancel_subscription(user: AuthUser = Depends(get_current_user)):
    sub = await _current_subscription(user.id)
    if not sub:
        raise HTTPException(status_code=404, detail="No active subscription")

    if sub["stripe_subscription_id"]:
        stripe = _stripe()
        stripe.Subscription.modify(sub["stripe_subscription_id"], cancel_at_period_end=True)

    await execute(
        "UPDATE subscriptions SET canceled_at = NOW() WHERE id = $1", sub["id"],
    )
    return {"detail": "Subscription will end at the current period. You keep access until then."}


@router.post("/subscription/reactivate")
async def reactivate_subscription(user: AuthUser = Depends(get_current_user)):
    sub = await _current_subscription(user.id)
    if not sub or sub["canceled_at"] is None:
        raise HTTPException(status_code=404, detail="No canceled subscription to reactivate")

    if sub["stripe_subscription_id"]:
        stripe = _stripe()
        stripe.Subscription.modify(sub["stripe_subscription_id"], cancel_at_period_end=False)

    await execute("UPDATE subscriptions SET canceled_at = NULL WHERE id = $1", sub["id"])
    return {"detail": "Subscription reactivated"}


@router.post("/subscription/upgrade")
async def upgrade_subscription(body: SubscribeRequest, request: Request, user: AuthUser = Depends(get_current_user)):
    """Upgrade goes through a new checkout session; Stripe prorates on completion."""
    return await subscribe(body, request, user)


@router.get("/payments/history")
async def payments_history(user: AuthUser = Depends(get_current_user)):
    rows = await fetch(
        """
        SELECT id, amount, currency, status, created_at
        FROM payments WHERE user_id = $1::uuid
        ORDER BY created_at DESC LIMIT 50
        """,
        user.id,
    )
    return [
        {
            "id": str(r["id"]),
            "amount": float(r["amount"]),
            "currency": r["currency"],
            "status": r["status"],
            "created_at": r["created_at"].isoformat(),
        }
        for r in rows
    ]


# ---------- Promo codes ----------

@router.post("/promo/apply")
async def promo_apply(body: PromoApplyRequest, user: AuthUser = Depends(get_current_user)):
    code = body.code.strip().upper()
    promo = await fetchrow("SELECT * FROM promo_codes WHERE code = $1", code)
    if not promo:
        raise HTTPException(status_code=404, detail="Promo code not found")
    if promo["expires_at"] and promo["expires_at"] < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Promo code expired")
    if promo["current_uses"] >= promo["max_uses"]:
        raise HTTPException(status_code=400, detail="Promo code usage limit reached")
    already = await fetchrow(
        "SELECT id FROM promo_redemptions WHERE promo_id = $1 AND user_id = $2::uuid",
        promo["id"], user.id,
    )
    if already:
        raise HTTPException(status_code=400, detail="You already used this promo code")
    return {
        "code": code,
        "discount_percent": promo["discount_percent"],
        "plan_type": promo["plan_type"],
        "detail": f"{promo['discount_percent']}% off — apply it at checkout",
    }


# ---------- Referrals ----------

@router.post("/referral/generate")
async def referral_generate(user: AuthUser = Depends(get_current_user)):
    existing = await fetchrow(
        "SELECT * FROM referral_codes WHERE user_id = $1::uuid", user.id,
    )
    if existing:
        code = existing["code"]
    else:
        code = secrets.token_hex(4).upper()
        await execute(
            "INSERT INTO referral_codes (user_id, code) VALUES ($1::uuid, $2)",
            user.id, code,
        )
    return {
        "code": code,
        "url": f"{settings.frontend_base_url}/register?ref={code}",
    }


@router.get("/referral/stats")
async def referral_stats(user: AuthUser = Depends(get_current_user)):
    code_row = await fetchrow(
        "SELECT * FROM referral_codes WHERE user_id = $1::uuid", user.id,
    )
    rewards = await fetch(
        """
        SELECT reward_type, granted_at FROM referral_rewards
        WHERE referrer_id = $1::uuid ORDER BY granted_at DESC
        """,
        user.id,
    )
    bonus = await fetchrow(
        "SELECT COALESCE(SUM(amount), 0) AS total FROM demo_bonuses WHERE user_id = $1::uuid",
        user.id,
    )
    return {
        "code": code_row["code"] if code_row else None,
        "signups": code_row["uses"] if code_row else 0,
        "rewards": [
            {"type": r["reward_type"], "granted_at": r["granted_at"].isoformat()}
            for r in rewards
        ],
        "bonus_demos_total": int(bonus["total"]) if bonus else 0,
    }


# ---------- Stripe webhook ----------

@router.post("/stripe/webhook")
async def stripe_webhook(request: Request):
    payload = await request.body()
    signature = request.headers.get("stripe-signature", "")

    if not settings.stripe_webhook_secret:
        raise HTTPException(status_code=503, detail="Webhook secret not configured")

    import stripe

    try:
        event = stripe.Webhook.construct_event(
            payload, signature, settings.stripe_webhook_secret,
        )
    except (ValueError, stripe.error.SignatureVerificationError):
        raise HTTPException(status_code=400, detail="Invalid webhook signature")

    event_type = event["type"]
    data = event["data"]["object"]
    logger.info("Stripe webhook: %s", event_type)

    if event_type == "checkout.session.completed":
        user_id = data.get("metadata", {}).get("user_id")
        plan = data.get("metadata", {}).get("plan_type", "PRO")
        interval = data.get("metadata", {}).get("interval", "monthly")
        if user_id:
            # End trial/previous subs, activate the new plan
            await execute(
                """
                UPDATE subscriptions SET status = 'replaced'
                WHERE user_id = $1::uuid AND status IN ('active', 'trialing')
                """,
                user_id,
            )
            await execute(
                """
                INSERT INTO subscriptions (user_id, plan_type, status, billing_interval,
                                           stripe_subscription_id, stripe_customer_id,
                                           current_period_start)
                VALUES ($1::uuid, $2, 'active', $3, $4, $5, NOW())
                ON CONFLICT (stripe_subscription_id) DO NOTHING
                """,
                user_id, plan, interval,
                data.get("subscription"), data.get("customer"),
            )
            await execute("UPDATE users SET role = $2 WHERE id = $1::uuid", user_id, plan)
            await grant_achievement(user_id, "pro_subscriber")
            await publish_activity(user_id, "subscribed", {"plan": plan})

            user_row = await fetchrow("SELECT * FROM users WHERE id = $1::uuid", user_id)
            if user_row:
                await send_subscription_confirmation(user_row["email"], user_row["username"], plan)

            # Referral: 1 free month for the referrer on first purchase
            reward = await fetchrow(
                """
                SELECT rr.referrer_id FROM referral_rewards rr
                WHERE rr.referred_id = $1::uuid AND rr.reward_type = 'signup_demos'
                """,
                user_id,
            )
            if reward:
                inserted = await fetchrow(
                    """
                    INSERT INTO referral_rewards (referrer_id, referred_id, reward_type)
                    VALUES ($1, $2::uuid, 'purchase_free_month')
                    ON CONFLICT DO NOTHING
                    RETURNING id
                    """,
                    reward["referrer_id"], user_id,
                )
                if inserted:
                    await execute(
                        """
                        UPDATE subscriptions
                        SET current_period_end = COALESCE(current_period_end, NOW()) + interval '30 days'
                        WHERE user_id = $1 AND status IN ('active', 'trialing')
                        """,
                        reward["referrer_id"],
                    )
                    referrer = await fetchrow(
                        "SELECT * FROM users WHERE id = $1", reward["referrer_id"],
                    )
                    if referrer:
                        await send_referral_bonus(
                            referrer["email"], referrer["username"], "1 month free",
                        )

    elif event_type == "customer.subscription.updated":
        sub_id = data.get("id")
        status = data.get("status", "active")
        period_start = data.get("current_period_start")
        period_end = data.get("current_period_end")
        await execute(
            """
            UPDATE subscriptions SET status = $2,
                current_period_start = to_timestamp($3),
                current_period_end = to_timestamp($4)
            WHERE stripe_subscription_id = $1
            """,
            sub_id, status, period_start, period_end,
        )

    elif event_type == "customer.subscription.deleted":
        sub_id = data.get("id")
        row = await fetchrow(
            "SELECT user_id FROM subscriptions WHERE stripe_subscription_id = $1", sub_id,
        )
        await execute(
            "UPDATE subscriptions SET status = 'canceled', canceled_at = NOW() WHERE stripe_subscription_id = $1",
            sub_id,
        )
        if row:
            await execute("UPDATE users SET role = 'FREE' WHERE id = $1", row["user_id"])

    elif event_type == "invoice.payment_succeeded":
        customer_id = data.get("customer")
        amount = (data.get("amount_paid") or 0) / 100
        sub = await fetchrow(
            "SELECT * FROM subscriptions WHERE stripe_customer_id = $1 ORDER BY created_at DESC LIMIT 1",
            customer_id,
        )
        if sub:
            await execute(
                """
                INSERT INTO payments (user_id, subscription_id, amount, currency,
                                      stripe_payment_intent_id, status)
                VALUES ($1, $2, $3, $4, $5, 'succeeded')
                ON CONFLICT (stripe_payment_intent_id) DO NOTHING
                """,
                sub["user_id"], sub["id"], amount,
                data.get("currency", "usd"), data.get("payment_intent"),
            )

    elif event_type == "invoice.payment_failed":
        customer_id = data.get("customer")
        sub = await fetchrow(
            "SELECT * FROM subscriptions WHERE stripe_customer_id = $1 ORDER BY created_at DESC LIMIT 1",
            customer_id,
        )
        if sub:
            await execute(
                "UPDATE subscriptions SET status = 'past_due' WHERE id = $1", sub["id"],
            )
            user_row = await fetchrow("SELECT * FROM users WHERE id = $1", sub["user_id"])
            if user_row:
                await send_payment_failed(user_row["email"], user_row["username"])

    return {"received": True}
