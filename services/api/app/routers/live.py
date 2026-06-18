from fastapi import APIRouter

from app.nba_client import get_live_scoreboard

router = APIRouter(prefix="/live", tags=["live"])


def _simplify_games(data: dict) -> list[dict]:
    games = data.get("scoreboard", {}).get("games", []) or []
    simplified = []
    for g in games:
        home = g.get("homeTeam") or {}
        away = g.get("awayTeam") or {}
        simplified.append(
            {
                "game_id": g.get("gameId"),
                "status": g.get("gameStatusText"),
                "period": g.get("period"),
                "clock": g.get("gameClock"),
                "home": {
                    "team_id": home.get("teamId"),
                    "tricode": home.get("teamTricode"),
                    "name": home.get("teamName"),
                    "score": home.get("score"),
                    "wins": home.get("wins"),
                    "losses": home.get("losses"),
                },
                "away": {
                    "team_id": away.get("teamId"),
                    "tricode": away.get("teamTricode"),
                    "name": away.get("teamName"),
                    "score": away.get("score"),
                    "wins": away.get("wins"),
                    "losses": away.get("losses"),
                },
            }
        )
    return simplified


@router.get("/scoreboard")
def scoreboard():
    try:
        data, source = get_live_scoreboard()
        return {
            "games": _simplify_games(data),
            "raw_date": data.get("scoreboard", {}).get("gameDate"),
            "source": source,
            "ok": True,
        }
    except Exception as exc:
        # Never 502 - UI can show a soft message instead of breaking
        return {
            "games": [],
            "raw_date": None,
            "source": "unavailable",
            "ok": False,
            "message": str(exc),
        }
