from fastapi import APIRouter, HTTPException, Query

from app.nba_client import get_player_profile, search_players

router = APIRouter(prefix="/players", tags=["players"])


@router.get("/search")
def player_search(q: str = Query(..., min_length=2), limit: int = Query(20, ge=1, le=50)):
    results = search_players(q, limit=limit)
    return {
        "query": q,
        "players": [
            {
                "id": p["id"],
                "full_name": p["full_name"],
                "is_active": p.get("is_active"),
            }
            for p in results
        ],
    }


@router.get("/{player_id}/profile")
def player_profile(player_id: int):
    try:
        return get_player_profile(player_id)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"NBA stats API error: {exc}") from exc
