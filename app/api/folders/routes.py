"""Demo folders / collections — organize uploads and import into tournaments."""

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from permissions import AuthUser, get_current_user
from postgres_repo import execute, fetch, fetchrow

router = APIRouter(prefix="/api/folders", tags=["folders"])


class FolderCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    description: str = Field(default="", max_length=500)
    color: str = Field(default="#22d3ee", max_length=20)
    tournament_id: str | None = None


class FolderMatchRequest(BaseModel):
    match_id: str


def _folder_row(row, match_count: int = 0) -> dict:
    return {
        "id": str(row["id"]),
        "name": row["name"],
        "description": row["description"],
        "color": row["color"],
        "tournament_id": str(row["tournament_id"]) if row["tournament_id"] else None,
        "match_count": match_count,
        "created_at": row["created_at"].isoformat(),
    }


async def _require_folder(folder_id: str, user: AuthUser):
    row = await fetchrow("SELECT * FROM demo_folders WHERE id = $1::uuid", folder_id)
    if not row:
        raise HTTPException(404, "Folder not found")
    if str(row["owner_id"]) != user.id and user.role not in ("ADMIN", "SUPERADMIN"):
        raise HTTPException(403, "Not your folder")
    return row


@router.post("")
async def create_folder(body: FolderCreate, user: AuthUser = Depends(get_current_user)):
    if body.tournament_id:
        t = await fetchrow(
            "SELECT id FROM tournaments WHERE id = $1::uuid AND owner_id = $2::uuid",
            body.tournament_id, user.id,
        )
        if not t:
            raise HTTPException(404, "Tournament not found")

    row = await fetchrow(
        """
        INSERT INTO demo_folders (owner_id, name, description, color, tournament_id)
        VALUES ($1::uuid, $2, $3, $4, $5::uuid)
        RETURNING *
        """,
        user.id,
        body.name,
        body.description,
        body.color,
        body.tournament_id,
    )
    return _folder_row(row)


@router.get("")
async def list_folders(user: AuthUser = Depends(get_current_user)):
    rows = await fetch(
        """
        SELECT f.*,
               (SELECT COUNT(*)::int FROM folder_matches fm WHERE fm.folder_id = f.id) AS match_count
        FROM demo_folders f
        WHERE f.owner_id = $1::uuid
        ORDER BY f.created_at DESC
        """,
        user.id,
    )
    return [_folder_row(dict(r), int(r["match_count"])) for r in rows]


@router.get("/{folder_id}")
async def get_folder(folder_id: str, user: AuthUser = Depends(get_current_user)):
    folder = await _require_folder(folder_id, user)
    matches = await fetch(
        """
        SELECT m.match_id, m.map_name, m.score_t, m.score_ct, m.team_t_name, m.team_ct_name,
               m.status, m.progress, m.created_at, fm.added_at
        FROM folder_matches fm
        JOIN matches m ON m.match_id = fm.match_id
        WHERE fm.folder_id = $1::uuid
        ORDER BY fm.added_at DESC
        """,
        folder_id,
    )
    return {
        **_folder_row(folder, len(matches)),
        "matches": [
            {
                "match_id": m["match_id"],
                "map_name": m["map_name"],
                "score_t": m["score_t"],
                "score_ct": m["score_ct"],
                "team_t_name": m["team_t_name"],
                "team_ct_name": m["team_ct_name"],
                "status": m["status"],
                "progress": m["progress"],
                "created_at": m["created_at"].isoformat() if m["created_at"] else None,
            }
            for m in matches
        ],
    }


@router.post("/{folder_id}/matches")
async def add_match_to_folder(
    folder_id: str, body: FolderMatchRequest, user: AuthUser = Depends(get_current_user),
):
    await _require_folder(folder_id, user)
    match = await fetchrow("SELECT match_id FROM matches WHERE match_id = $1", body.match_id)
    if not match:
        raise HTTPException(404, "Match not found")
    await execute(
        """
        INSERT INTO folder_matches (folder_id, match_id)
        VALUES ($1::uuid, $2)
        ON CONFLICT DO NOTHING
        """,
        folder_id, body.match_id,
    )
    return {"detail": "Match added to folder"}


@router.delete("/{folder_id}/matches/{match_id}")
async def remove_match_from_folder(
    folder_id: str, match_id: str, user: AuthUser = Depends(get_current_user),
):
    await _require_folder(folder_id, user)
    await execute(
        "DELETE FROM folder_matches WHERE folder_id = $1::uuid AND match_id = $2",
        folder_id, match_id,
    )
    return {"detail": "Removed"}


@router.delete("/{folder_id}")
async def delete_folder(folder_id: str, user: AuthUser = Depends(get_current_user)):
    await _require_folder(folder_id, user)
    await execute("DELETE FROM demo_folders WHERE id = $1::uuid", folder_id)
    return {"detail": "Folder deleted"}


@router.post("/{folder_id}/import-to-tournament/{tournament_id}")
async def import_folder_to_tournament(
    folder_id: str,
    tournament_id: str,
    stage: str = Query("group"),
    user: AuthUser = Depends(get_current_user),
):
    """Add all ready demos from a folder into a tournament."""
    await _require_folder(folder_id, user)
    t = await fetchrow(
        "SELECT id FROM tournaments WHERE id = $1::uuid AND owner_id = $2::uuid",
        tournament_id, user.id,
    )
    if not t and user.role not in ("ADMIN", "SUPERADMIN"):
        t = await fetchrow("SELECT id FROM tournaments WHERE id = $1::uuid", tournament_id)
        if not t:
            raise HTTPException(404, "Tournament not found")
        owner_check = await fetchrow(
            "SELECT owner_id FROM tournaments WHERE id = $1::uuid", tournament_id,
        )
        if owner_check and str(owner_check["owner_id"]) != user.id and user.role not in ("ADMIN", "SUPERADMIN"):
            raise HTTPException(403, "Not your tournament")

    ready = await fetch(
        """
        SELECT m.match_id FROM folder_matches fm
        JOIN matches m ON m.match_id = fm.match_id
        WHERE fm.folder_id = $1::uuid AND m.status = 'ready'
        """,
        folder_id,
    )
    added = 0
    for r in ready:
        await execute(
            """
            INSERT INTO tournament_matches (tournament_id, match_id, stage)
            VALUES ($1::uuid, $2, $3)
            ON CONFLICT (tournament_id, match_id) DO UPDATE SET stage = EXCLUDED.stage
            """,
            tournament_id, r["match_id"], stage,
        )
        added += 1

    # Link folder → tournament for convenience
    await execute(
        "UPDATE demo_folders SET tournament_id = $1::uuid WHERE id = $2::uuid",
        tournament_id, folder_id,
    )
    return {"detail": "Imported", "added": added}
