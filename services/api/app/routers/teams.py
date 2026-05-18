from fastapi import APIRouter

from app.nba_client import get_all_teams

router = APIRouter(prefix="/teams", tags=["teams"])


@router.get("")
def list_teams():
    teams = get_all_teams()
    return {
        "teams": [
            {
                "id": t["id"],
                "full_name": t["full_name"],
                "abbreviation": t["abbreviation"],
                "city": t["city"],
                "nickname": t["nickname"],
            }
            for t in teams
        ]
    }
