"""Social endpoints: activity feed, follow system."""

import json

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from gamification import level_from_xp
from permissions import AuthUser, get_current_user
from postgres_repo import execute, fetch, fetchrow

router = APIRouter(prefix="/api/social", tags=["social"])


class CommentRequest(BaseModel):
    text: str = Field(min_length=1, max_length=500)


@router.get("/feed")
async def activity_feed(
    scope: str = Query("global", pattern="^(global|following|clan)$"),
    limit: int = Query(30, le=100),
    user: AuthUser = Depends(get_current_user),
):
    if scope == "following":
        rows = await fetch(
            """
            SELECT af.id, af.event_type, af.payload, af.created_at,
                   u.username, u.avatar_url, u.xp, u.role
            FROM activity_feed af
            JOIN users u ON u.id = af.user_id
            JOIN follows f ON f.following_id = af.user_id AND f.follower_id = $1::uuid
            ORDER BY af.created_at DESC LIMIT $2
            """,
            user.id, limit,
        )
    elif scope == "clan":
        rows = await fetch(
            """
            SELECT af.id, af.event_type, af.payload, af.created_at,
                   u.username, u.avatar_url, u.xp, u.role
            FROM activity_feed af
            JOIN users u ON u.id = af.user_id
            JOIN clan_members cm ON cm.user_id = af.user_id
            WHERE cm.clan_id = (SELECT clan_id FROM clan_members WHERE user_id = $1::uuid)
            ORDER BY af.created_at DESC LIMIT $2
            """,
            user.id, limit,
        )
    else:
        rows = await fetch(
            """
            SELECT af.id, af.event_type, af.payload, af.created_at,
                   u.username, u.avatar_url, u.xp, u.role
            FROM activity_feed af
            JOIN users u ON u.id = af.user_id
            ORDER BY af.created_at DESC LIMIT $1
            """,
            limit,
        )

    following_rows = await fetch(
        """
        SELECT u.username FROM follows f
        JOIN users u ON u.id = f.following_id
        WHERE f.follower_id = $1::uuid
        """,
        user.id,
    )
    following = {r["username"] for r in following_rows}
    me = await fetchrow("SELECT username FROM users WHERE id = $1::uuid", user.id)
    my_username = me["username"] if me else None

    activity_ids = [r["id"] for r in rows]
    like_counts: dict[str, int] = {}
    comment_counts: dict[str, int] = {}
    my_likes: set[str] = set()
    if activity_ids:
        like_rows = await fetch(
            """
            SELECT activity_id, COUNT(*)::int AS n,
                   BOOL_OR(user_id = $2::uuid) AS liked_by_me
            FROM feed_likes WHERE activity_id = ANY($1)
            GROUP BY activity_id
            """,
            activity_ids, user.id,
        )
        for lr in like_rows:
            like_counts[str(lr["activity_id"])] = int(lr["n"])
            if lr["liked_by_me"]:
                my_likes.add(str(lr["activity_id"]))
        comment_rows = await fetch(
            """
            SELECT activity_id, COUNT(*)::int AS n
            FROM feed_comments WHERE activity_id = ANY($1)
            GROUP BY activity_id
            """,
            activity_ids,
        )
        comment_counts = {str(cr["activity_id"]): int(cr["n"]) for cr in comment_rows}

    return [
        {
            "id": str(r["id"]),
            "event_type": r["event_type"],
            "payload": json.loads(r["payload"]) if isinstance(r["payload"], str) else r["payload"],
            "created_at": r["created_at"].isoformat(),
            "username": r["username"],
            "avatar_url": r["avatar_url"],
            "level": level_from_xp(int(r["xp"])),
            "role": r["role"],
            "is_me": r["username"] == my_username,
            "is_following": r["username"] in following,
            "like_count": like_counts.get(str(r["id"]), 0),
            "comment_count": comment_counts.get(str(r["id"]), 0),
            "liked_by_me": str(r["id"]) in my_likes,
        }
        for r in rows
    ]


@router.post("/feed/{activity_id}/like")
async def like_activity(activity_id: str, user: AuthUser = Depends(get_current_user)):
    exists = await fetchrow("SELECT id FROM activity_feed WHERE id = $1::uuid", activity_id)
    if not exists:
        raise HTTPException(status_code=404, detail="Activity not found")
    await execute(
        """
        INSERT INTO feed_likes (activity_id, user_id) VALUES ($1::uuid, $2::uuid)
        ON CONFLICT (activity_id, user_id) DO NOTHING
        """,
        activity_id, user.id,
    )
    return {"detail": "Liked"}


@router.delete("/feed/{activity_id}/like")
async def unlike_activity(activity_id: str, user: AuthUser = Depends(get_current_user)):
    await execute(
        "DELETE FROM feed_likes WHERE activity_id = $1::uuid AND user_id = $2::uuid",
        activity_id, user.id,
    )
    return {"detail": "Unliked"}


@router.get("/feed/{activity_id}/comments")
async def list_comments(activity_id: str, user: AuthUser = Depends(get_current_user)):
    rows = await fetch(
        """
        SELECT fc.id, fc.text, fc.created_at, u.username, u.avatar_url, u.xp,
               fc.user_id = $2::uuid AS is_me
        FROM feed_comments fc
        JOIN users u ON u.id = fc.user_id
        WHERE fc.activity_id = $1::uuid
        ORDER BY fc.created_at
        LIMIT 100
        """,
        activity_id, user.id,
    )
    return [
        {
            "id": str(r["id"]),
            "text": r["text"],
            "created_at": r["created_at"].isoformat(),
            "username": r["username"],
            "avatar_url": r["avatar_url"],
            "level": level_from_xp(int(r["xp"])),
            "is_me": bool(r["is_me"]),
        }
        for r in rows
    ]


@router.post("/feed/{activity_id}/comments")
async def add_comment(
    activity_id: str, body: CommentRequest, user: AuthUser = Depends(get_current_user),
):
    exists = await fetchrow("SELECT id FROM activity_feed WHERE id = $1::uuid", activity_id)
    if not exists:
        raise HTTPException(status_code=404, detail="Activity not found")
    row = await fetchrow(
        """
        INSERT INTO feed_comments (activity_id, user_id, text)
        VALUES ($1::uuid, $2::uuid, $3)
        RETURNING id, created_at
        """,
        activity_id, user.id, body.text.strip(),
    )
    me = await fetchrow("SELECT username, avatar_url, xp FROM users WHERE id = $1::uuid", user.id)
    return {
        "id": str(row["id"]),
        "text": body.text.strip(),
        "created_at": row["created_at"].isoformat(),
        "username": me["username"],
        "avatar_url": me["avatar_url"],
        "level": level_from_xp(int(me["xp"])),
        "is_me": True,
    }


@router.delete("/comments/{comment_id}")
async def delete_comment(comment_id: str, user: AuthUser = Depends(get_current_user)):
    row = await fetchrow("SELECT user_id FROM feed_comments WHERE id = $1::uuid", comment_id)
    if not row:
        raise HTTPException(status_code=404, detail="Comment not found")
    if str(row["user_id"]) != user.id and user.role not in ("ADMIN", "SUPERADMIN"):
        raise HTTPException(status_code=403, detail="You can only delete your own comments")
    await execute("DELETE FROM feed_comments WHERE id = $1::uuid", comment_id)
    return {"detail": "Comment deleted"}


@router.post("/follow/{username}")
async def follow_user(username: str, user: AuthUser = Depends(get_current_user)):
    target = await fetchrow("SELECT id FROM users WHERE username = $1", username)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if str(target["id"]) == user.id:
        raise HTTPException(status_code=400, detail="You cannot follow yourself")

    await execute(
        """
        INSERT INTO follows (follower_id, following_id)
        VALUES ($1::uuid, $2)
        ON CONFLICT (follower_id, following_id) DO NOTHING
        """,
        user.id, target["id"],
    )
    return {"detail": f"Following {username}"}


@router.delete("/follow/{username}")
async def unfollow_user(username: str, user: AuthUser = Depends(get_current_user)):
    target = await fetchrow("SELECT id FROM users WHERE username = $1", username)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    await execute(
        "DELETE FROM follows WHERE follower_id = $1::uuid AND following_id = $2",
        user.id, target["id"],
    )
    return {"detail": f"Unfollowed {username}"}


@router.get("/follow/stats")
async def follow_stats(user: AuthUser = Depends(get_current_user)):
    followers = await fetchrow(
        "SELECT COUNT(*) AS n FROM follows WHERE following_id = $1::uuid", user.id,
    )
    following = await fetch(
        """
        SELECT u.username, u.avatar_url, u.xp FROM follows f
        JOIN users u ON u.id = f.following_id
        WHERE f.follower_id = $1::uuid
        ORDER BY f.created_at DESC
        """,
        user.id,
    )
    return {
        "followers": int(followers["n"]),
        "following": [
            {
                "username": r["username"],
                "avatar_url": r["avatar_url"],
                "level": level_from_xp(int(r["xp"])),
            }
            for r in following
        ],
    }
