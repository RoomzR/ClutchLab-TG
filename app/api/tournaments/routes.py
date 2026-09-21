"""Tournament mode: folders import, Lab Rating leaderboards, player analytics."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from permissions import AuthUser, get_current_user
from postgres_repo import execute, fetch, fetchrow
from tournament_stats import build_analytics, player_profile

router = APIRouter(prefix="/api/tournaments", tags=["tournaments"])

STAGES = ("group", "quarter", "semi", "final", "other")


class TournamentCreateRequest(BaseModel):
    name: str = Field(min_length=3, max_length=80)
    description: str = Field(default="", max_length=500)


class TournamentMatchRequest(BaseModel):
    match_id: str
    stage: str = Field(default="group", max_length=40)


class ImportFolderRequest(BaseModel):
    folder_id: str
    stage: str = Field(default="group", max_length=40)


def _tournament_row(row, match_count: int = 0) -> dict:
    return {
        "id": str(row["id"]),
        "name": row["name"],
        "description": row["description"],
        "status": row["status"],
        "owner": row["username"] if "username" in row.keys() else None,
        "match_count": match_count,
        "created_at": row["created_at"].isoformat(),
    }


@router.post("")
async def create_tournament(
    body: TournamentCreateRequest, user: AuthUser = Depends(get_current_user),
):
    row = await fetchrow(
        """
        INSERT INTO tournaments (owner_id, name, description)
        VALUES ($1::uuid, $2, $3)
        RETURNING *
        """,
        user.id, body.name, body.description,
    )
    payload = dict(row)
    me = await fetchrow("SELECT username FROM users WHERE id = $1::uuid", user.id)
    payload["username"] = me["username"] if me else None
    return _tournament_row(payload)


@router.get("")
async def list_tournaments(user: AuthUser = Depends(get_current_user)):
    rows = await fetch(
        """
        SELECT t.*, u.username,
               (SELECT COUNT(*)::int FROM tournament_matches tm WHERE tm.tournament_id = t.id) AS match_count
        FROM tournaments t
        JOIN users u ON u.id = t.owner_id
        WHERE t.owner_id = $1::uuid
        ORDER BY t.created_at DESC
        """,
        user.id,
    )
    return [_tournament_row(dict(r), int(r["match_count"])) for r in rows]


async def _require_owner(tournament_id: str, user: AuthUser):
    row = await fetchrow("SELECT * FROM tournaments WHERE id = $1::uuid", tournament_id)
    if not row:
        raise HTTPException(status_code=404, detail="Tournament not found")
    if str(row["owner_id"]) != user.id and user.role not in ("ADMIN", "SUPERADMIN"):
        raise HTTPException(status_code=403, detail="Not your tournament")
    return row


@router.post("/{tournament_id}/matches")
async def add_match(
    tournament_id: str, body: TournamentMatchRequest, user: AuthUser = Depends(get_current_user),
):
    await _require_owner(tournament_id, user)
    match = await fetchrow(
        "SELECT match_id, status FROM matches WHERE match_id = $1", body.match_id,
    )
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    if match["status"] != "ready":
        raise HTTPException(status_code=400, detail="Match is not parsed yet")

    stage = body.stage if body.stage in STAGES else "group"
    await execute(
        """
        INSERT INTO tournament_matches (tournament_id, match_id, stage)
        VALUES ($1::uuid, $2, $3)
        ON CONFLICT (tournament_id, match_id) DO UPDATE SET stage = EXCLUDED.stage
        """,
        tournament_id, body.match_id, stage,
    )
    return {"detail": "Match added to tournament"}


@router.post("/{tournament_id}/import-folder")
async def import_folder(
    tournament_id: str, body: ImportFolderRequest, user: AuthUser = Depends(get_current_user),
):
    await _require_owner(tournament_id, user)
    folder = await fetchrow(
        "SELECT id FROM demo_folders WHERE id = $1::uuid AND owner_id = $2::uuid",
        body.folder_id, user.id,
    )
    if not folder:
        raise HTTPException(404, "Folder not found")

    stage = body.stage if body.stage in STAGES else "group"
    ready = await fetch(
        """
        SELECT m.match_id FROM folder_matches fm
        JOIN matches m ON m.match_id = fm.match_id
        WHERE fm.folder_id = $1::uuid AND m.status = 'ready'
        """,
        body.folder_id,
    )
    for r in ready:
        await execute(
            """
            INSERT INTO tournament_matches (tournament_id, match_id, stage)
            VALUES ($1::uuid, $2, $3)
            ON CONFLICT (tournament_id, match_id) DO UPDATE SET stage = EXCLUDED.stage
            """,
            tournament_id, r["match_id"], stage,
        )
    await execute(
        "UPDATE demo_folders SET tournament_id = $1::uuid WHERE id = $2::uuid",
        tournament_id, body.folder_id,
    )
    return {"detail": "Imported", "added": len(ready)}


@router.delete("/{tournament_id}/matches/{match_id}")
async def remove_match(
    tournament_id: str, match_id: str, user: AuthUser = Depends(get_current_user),
):
    await _require_owner(tournament_id, user)
    await execute(
        "DELETE FROM tournament_matches WHERE tournament_id = $1::uuid AND match_id = $2",
        tournament_id, match_id,
    )
    return {"detail": "Match removed"}


@router.delete("/{tournament_id}")
async def delete_tournament(tournament_id: str, user: AuthUser = Depends(get_current_user)):
    await _require_owner(tournament_id, user)
    await execute("DELETE FROM tournaments WHERE id = $1::uuid", tournament_id)
    return {"detail": "Tournament deleted"}


@router.get("/{tournament_id}")
async def tournament_detail(tournament_id: str, user: AuthUser = Depends(get_current_user)):
    tournament = await fetchrow(
        """
        SELECT t.*, u.username FROM tournaments t
        JOIN users u ON u.id = t.owner_id
        WHERE t.id = $1::uuid
        """,
        tournament_id,
    )
    if not tournament:
        raise HTTPException(status_code=404, detail="Tournament not found")
    if str(tournament["owner_id"]) != user.id and user.role not in ("ADMIN", "SUPERADMIN"):
        raise HTTPException(status_code=403, detail="Not your tournament")

    matches = await fetch(
        """
        SELECT tm.stage, tm.added_at, m.match_id, m.map_name, m.score_t, m.score_ct,
               m.team_t_name, m.team_ct_name, m.created_at
        FROM tournament_matches tm
        JOIN matches m ON m.match_id = tm.match_id
        WHERE tm.tournament_id = $1::uuid
        ORDER BY tm.added_at
        """,
        tournament_id,
    )
    match_ids = [m["match_id"] for m in matches]
    analytics = await build_analytics(match_ids)

    folders = await fetch(
        """
        SELECT f.id, f.name, f.color,
               (SELECT COUNT(*)::int FROM folder_matches fm WHERE fm.folder_id = f.id) AS match_count
        FROM demo_folders f
        WHERE f.owner_id = $1::uuid
          AND (f.tournament_id = $2::uuid OR f.tournament_id IS NULL)
        ORDER BY f.created_at DESC
        """,
        user.id, tournament_id,
    )

    return {
        **_tournament_row(dict(tournament), len(matches)),
        "matches": [
            {
                "match_id": m["match_id"],
                "map_name": m["map_name"],
                "score_t": m["score_t"],
                "score_ct": m["score_ct"],
                "team_t_name": m["team_t_name"],
                "team_ct_name": m["team_ct_name"],
                "stage": m["stage"],
                "created_at": m["created_at"].isoformat() if m["created_at"] else None,
            }
            for m in matches
        ],
        "player_stats": analytics["player_stats"],
        "mvp": analytics["mvp"],
        "awards": analytics["awards"],
        "map_pool": analytics["map_pool"],
        "head_to_head": analytics["head_to_head"],
        "summary": analytics["summary"],
        "folders": [
            {
                "id": str(f["id"]),
                "name": f["name"],
                "color": f["color"],
                "match_count": int(f["match_count"]),
            }
            for f in folders
        ],
        "rating_note": (
            "Lab Rating ≈ HLTV Rating 2.0 using kills/deaths/rounds "
            "(ADR & KAST estimated — no damage events in demo parse yet)."
        ),
    }


@router.get("/{tournament_id}/players/{player_name}")
async def tournament_player(
    tournament_id: str, player_name: str, user: AuthUser = Depends(get_current_user),
):
    await _require_owner(tournament_id, user)
    match_ids = [
        r["match_id"]
        for r in await fetch(
            "SELECT match_id FROM tournament_matches WHERE tournament_id = $1::uuid",
            tournament_id,
        )
    ]
    profile = await player_profile(match_ids, player_name)
    if not profile:
        raise HTTPException(404, "Player not found in this tournament")
    return profile
