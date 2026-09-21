"""Discord webhook notifications + FACEIT demo import."""

import gzip
import logging
import os
import re
import uuid as uuid_mod

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from config import settings
from permissions import AuthUser, get_current_user
from postgres_repo import execute, fetchrow

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/integrations", tags=["integrations"])


# ---------- Discord ----------

async def send_discord_webhook(webhook_url: str, title: str, description: str, url: str | None = None) -> bool:
    embed: dict = {
        "title": title,
        "description": description,
        "color": 0x22D3EE,
        "footer": {"text": "ClutchLab — CS2 Demo Intelligence"},
    }
    if url:
        embed["url"] = url
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(webhook_url, json={"embeds": [embed]})
        return response.status_code in (200, 204)
    except Exception as exc:
        logger.warning("Discord webhook failed: %s", exc)
        return False


async def notify_demo_ready(user_id: str, match_id: str, map_name: str | None) -> None:
    """Fire the owner's Discord webhook when their demo finishes parsing."""
    row = await fetchrow(
        "SELECT discord_webhook_url FROM users WHERE id = $1::uuid", user_id,
    )
    if not row or not row["discord_webhook_url"]:
        return
    await send_discord_webhook(
        row["discord_webhook_url"],
        "Demo analyzed ✅",
        f"Your demo on **{map_name or 'unknown map'}** is ready to review.",
        f"{settings.frontend_base_url}/match/{match_id}",
    )


class DiscordTestRequest(BaseModel):
    pass


@router.post("/discord/test")
async def discord_test(user: AuthUser = Depends(get_current_user)):
    row = await fetchrow(
        "SELECT discord_webhook_url, username FROM users WHERE id = $1::uuid", user.id,
    )
    if not row or not row["discord_webhook_url"]:
        raise HTTPException(status_code=400, detail="Set your Discord webhook URL in Settings first")
    ok = await send_discord_webhook(
        row["discord_webhook_url"],
        "Webhook connected 🎯",
        f"Hey {row['username']}! ClutchLab will post here when your demos are ready.",
    )
    if not ok:
        raise HTTPException(status_code=400, detail="Discord rejected the webhook — check the URL")
    return {"detail": "Test message sent to Discord"}


# ---------- FACEIT ----------

FACEIT_API = "https://open.faceit.com/data/v4"
FACEIT_MATCH_RE = re.compile(r"(1-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})")


class FaceitImportRequest(BaseModel):
    match_url: str = Field(max_length=300, description="FACEIT match room URL or match ID")


@router.post("/faceit/import")
async def faceit_import(body: FaceitImportRequest, user: AuthUser = Depends(get_current_user)):
    """Download a demo straight from a FACEIT match room and queue it for parsing."""
    if not settings.faceit_api_key:
        raise HTTPException(
            status_code=503,
            detail="FACEIT integration is not configured on this server (FACEIT_API_KEY missing)",
        )

    match = FACEIT_MATCH_RE.search(body.match_url)
    if not match:
        raise HTTPException(status_code=422, detail="Could not find a FACEIT match ID in that URL")
    faceit_match_id = match.group(1)

    headers = {"Authorization": f"Bearer {settings.faceit_api_key}"}
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.get(f"{FACEIT_API}/matches/{faceit_match_id}", headers=headers)
    if response.status_code == 404:
        raise HTTPException(status_code=404, detail="FACEIT match not found")
    if response.status_code != 200:
        raise HTTPException(status_code=502, detail=f"FACEIT API error ({response.status_code})")

    data = response.json()
    demo_urls = data.get("demo_url") or []
    if not demo_urls:
        raise HTTPException(status_code=404, detail="No demo available for this match yet")

    # Quota check mirrors the regular upload flow
    from main import _check_upload_quota  # local import avoids circular dependency
    from parse_queue import enqueue_parse, is_priority_role

    demo_url = demo_urls[0]
    match_id = str(uuid_mod.uuid4())
    file_path = os.path.join(settings.upload_dir, f"{match_id}.dem")

    async with httpx.AsyncClient(timeout=300, follow_redirects=True) as client:
        demo_response = await client.get(demo_url)
    if demo_response.status_code != 200:
        raise HTTPException(status_code=502, detail="Failed to download demo from FACEIT")

    content = demo_response.content
    if demo_url.endswith(".gz") or content[:2] == b"\x1f\x8b":
        try:
            content = gzip.decompress(content)
        except Exception:
            raise HTTPException(status_code=502, detail="Failed to decompress FACEIT demo")

    await _check_upload_quota(user, len(content))

    with open(file_path, "wb") as f:
        f.write(content)

    await execute(
        """
        INSERT INTO matches (match_id, status, progress, file_path, owner_id)
        VALUES ($1, 'pending', 0, $2, $3::uuid)
        """,
        match_id, file_path, user.id,
    )
    await execute(
        "INSERT INTO demo_usage (user_id, match_id, file_size_bytes) VALUES ($1::uuid, $2, $3)",
        user.id, match_id, len(content),
    )
    lane = await enqueue_parse(match_id, file_path, priority=is_priority_role(user.role))
    return {"match_id": match_id, "queue": lane, "detail": "FACEIT demo imported and queued"}
