"""Head-to-head player-season comparison.

Each side of the matchup picks its own player AND its own season, so
cross-era comparisons work. See app/head_to_head.py for the data layer.
"""

import re

from fastapi import APIRouter, HTTPException, Query

from app import head_to_head

router = APIRouter(prefix="/head-to-head", tags=["head-to-head"])

# NBA season ids look like "2012-13". Validated here rather than passed
# straight through to nba_api / the cache filename.
_SEASON_RE = re.compile(r"^\d{4}-\d{2}$")


def _check_season(label: str, season: str) -> str:
    if not _SEASON_RE.match(season):
        raise HTTPException(422, f"{label} must look like '2012-13', got '{season}'.")
    return season


@router.get("/search")
def search(q: str = Query(..., min_length=2, max_length=40), limit: int = Query(15, ge=1, le=50)):
    """Name search across every player in NBA history."""
    return {"query": q, "players": head_to_head.search_players(q, limit=limit)}


@router.get("/player/{player_id}/seasons")
def seasons(player_id: int):
    """Every season this player played, newest first — fills the year picker."""
    try:
        data = head_to_head.player_seasons(player_id)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(502, f"NBA stats API error: {exc}") from exc
    if not data["seasons"]:
        raise HTTPException(404, "No regular-season records found for this player.")
    return data


@router.get("/compare")
def compare(
    a_id: int = Query(...),
    a_season: str = Query(..., max_length=7),
    b_id: int = Query(...),
    b_season: str = Query(..., max_length=7),
):
    """The three comparison cards for two player-seasons."""
    _check_season("a_season", a_season)
    _check_season("b_season", b_season)
    if a_id == b_id and a_season == b_season:
        raise HTTPException(422, "Pick two different player-seasons to compare.")

    try:
        data = head_to_head.build_comparison(a_id, a_season, b_id, b_season)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(502, f"NBA stats API error: {exc}") from exc

    if not data["cards"]["stats"] and not data["cards"]["efficiency"]:
        # No box line on at least one side — usually a season the player was
        # rostered for but never played (or a player_id with no NBA record).
        raise HTTPException(404, "No NBA regular-season data for one of these player-seasons.")
    return data
