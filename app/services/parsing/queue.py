"""Priority parse queue: Redis-backed (high/normal lists) with asyncio fallback.

PRO+ users' demos go to the high-priority queue and are always picked up
before FREE demos. Workers run inside the API process (lifespan-managed).
"""

import asyncio
import json
import logging
from typing import Awaitable, Callable

from config import settings

logger = logging.getLogger(__name__)

HIGH_KEY = "parse_queue:high"
NORMAL_KEY = "parse_queue:normal"

PRIORITY_ROLES = {"PRO", "TEAM", "ORGANIZATION", "ANALYST", "COACH", "ADMIN", "SUPERADMIN"}

_redis = None
_redis_checked = False

# Fallback queues when Redis is down
_local_high: asyncio.Queue = asyncio.Queue()
_local_normal: asyncio.Queue = asyncio.Queue()

_workers: list[asyncio.Task] = []


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
        logger.info("Parse queue: Redis connected")
    except Exception as exc:
        logger.warning("Parse queue: Redis unavailable (%s), using in-memory queue", exc)
        _redis = None
    return _redis


def is_priority_role(role: str | None) -> bool:
    return role in PRIORITY_ROLES


async def enqueue_parse(match_id: str, file_path: str, *, priority: bool) -> str:
    """Queue a demo for parsing. Returns 'high' or 'normal'."""
    item = json.dumps({"match_id": match_id, "file_path": file_path})
    lane = "high" if priority else "normal"

    redis = await _get_redis()
    if redis is not None:
        try:
            await redis.rpush(HIGH_KEY if priority else NORMAL_KEY, item)
            return lane
        except Exception as exc:
            logger.warning("Parse queue: Redis push failed (%s), using memory", exc)

    await (_local_high if priority else _local_normal).put(item)
    return lane


async def queue_depth() -> dict:
    redis = await _get_redis()
    if redis is not None:
        try:
            return {
                "high": int(await redis.llen(HIGH_KEY)),
                "normal": int(await redis.llen(NORMAL_KEY)),
            }
        except Exception:
            pass
    return {"high": _local_high.qsize(), "normal": _local_normal.qsize()}


async def _pop_next() -> dict | None:
    """Pop the next item, preferring the high-priority lane."""
    redis = await _get_redis()
    if redis is not None:
        try:
            # BLPOP checks keys in order → high lane always wins
            result = await redis.blpop([HIGH_KEY, NORMAL_KEY], timeout=3)
            if result is None:
                return None
            _, raw = result
            return json.loads(raw)
        except Exception as exc:
            logger.warning("Parse queue: Redis pop failed (%s)", exc)
            await asyncio.sleep(1)
            return None

    try:
        return json.loads(_local_high.get_nowait())
    except asyncio.QueueEmpty:
        pass
    try:
        return json.loads(_local_normal.get_nowait())
    except asyncio.QueueEmpty:
        pass
    await asyncio.sleep(1)
    return None


async def _worker(worker_id: int, handler: Callable[[str, str], Awaitable[None]]) -> None:
    logger.info("Parse worker %d started", worker_id)
    while True:
        try:
            item = await _pop_next()
            if item is None:
                continue
            logger.info("Worker %d parsing %s", worker_id, item["match_id"])
            await handler(item["match_id"], item["file_path"])
        except asyncio.CancelledError:
            logger.info("Parse worker %d stopped", worker_id)
            raise
        except Exception:
            logger.exception("Parse worker %d crashed on item; continuing", worker_id)


def start_workers(handler: Callable[[str, str], Awaitable[None]], count: int = 2) -> None:
    for i in range(count):
        _workers.append(asyncio.create_task(_worker(i + 1, handler)))


async def stop_workers() -> None:
    for task in _workers:
        task.cancel()
    for task in _workers:
        try:
            await task
        except (asyncio.CancelledError, Exception):
            pass
    _workers.clear()
