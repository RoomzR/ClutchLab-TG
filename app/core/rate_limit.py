"""Rate limiting backed by Redis with in-memory fallback (dev without Redis)."""

import logging
import time

from fastapi import HTTPException, Request

from config import settings

logger = logging.getLogger(__name__)

_redis = None
_redis_checked = False

# In-memory fallback: {key: (window_start, count)}
_memory_buckets: dict[str, tuple[float, int]] = {}


async def _get_redis():
    global _redis, _redis_checked
    if _redis_checked:
        return _redis
    _redis_checked = True
    try:
        import redis.asyncio as aioredis

        client = aioredis.from_url(settings.redis_url, socket_connect_timeout=2)
        await client.ping()
        _redis = client
        logger.info("Rate limiter: Redis connected")
    except Exception as exc:
        logger.warning("Rate limiter: Redis unavailable (%s), using in-memory fallback", exc)
        _redis = None
    return _redis


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


async def _hit(key: str, limit: int, window_seconds: int = 60) -> bool:
    """Increment counter for key; True if within limit."""
    redis = await _get_redis()
    if redis is not None:
        try:
            count = await redis.incr(key)
            if count == 1:
                await redis.expire(key, window_seconds)
            return int(count) <= limit
        except Exception as exc:
            logger.warning("Redis rate-limit error, falling back to memory: %s", exc)

    now = time.monotonic()
    window_start, count = _memory_buckets.get(key, (now, 0))
    if now - window_start >= window_seconds:
        window_start, count = now, 0
    count += 1
    _memory_buckets[key] = (window_start, count)
    if len(_memory_buckets) > 50_000:
        cutoff = now - window_seconds
        for k in [k for k, (start, _) in _memory_buckets.items() if start < cutoff]:
            _memory_buckets.pop(k, None)
    return count <= limit


async def check_rate_limit(request: Request, bucket: str = "general") -> None:
    """Raise 429 when the per-IP request budget for the bucket is exhausted."""
    ip = _client_ip(request)
    limit = (
        settings.rate_limit_auth_per_min
        if bucket == "auth"
        else settings.rate_limit_general_per_min
    )
    ok = await _hit(f"rl:{bucket}:{ip}", limit)
    if not ok:
        raise HTTPException(status_code=429, detail="Too many requests. Please slow down.")


async def register_login_failure(email: str) -> None:
    await _hit(f"loginfail:{email.lower()}", 10**9, settings.login_lockout_minutes * 60)


async def is_login_locked(email: str) -> bool:
    """True after too many failed logins within the lockout window."""
    redis = await _get_redis()
    key = f"loginfail:{email.lower()}"
    if redis is not None:
        try:
            value = await redis.get(key)
            return value is not None and int(value) >= settings.login_max_failures
        except Exception:
            pass
    _, count = _memory_buckets.get(key, (0.0, 0))
    return count >= settings.login_max_failures


async def clear_login_failures(email: str) -> None:
    redis = await _get_redis()
    key = f"loginfail:{email.lower()}"
    if redis is not None:
        try:
            await redis.delete(key)
            return
        except Exception:
            pass
    _memory_buckets.pop(key, None)
