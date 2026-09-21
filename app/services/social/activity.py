"""Activity feed publishing helper."""

import json
import logging

from postgres_repo import execute

logger = logging.getLogger(__name__)


async def publish_activity(user_id: str, event_type: str, payload: dict | None = None) -> None:
    """Insert a feed event; failures never break the calling flow."""
    try:
        await execute(
            "INSERT INTO activity_feed (user_id, event_type, payload) VALUES ($1::uuid, $2, $3::jsonb)",
            user_id, event_type, json.dumps(payload or {}),
        )
    except Exception as exc:
        logger.warning("Activity publish failed (%s): %s", event_type, exc)
