"""Lineup Optimizer — best 5-man lineups by net rating from LeagueDashLineups."""

import time
from fastapi import APIRouter, HTTPException
from nba_api.stats.endpoints import leaguedashlineups
from nba_api.stats.static import teams as static_teams

router = APIRouter(prefix="/lineups", tags=["lineups"])
SEASON = "2024-25"
MIN_MINUTES = 15.0


def _sleep():
    time.sleep(0.7)


@router.get("/team/{team_id}")
def team_lineups(team_id: int, min_minutes: float = MIN_MINUTES):
    _sleep()
    try:
        raw = leaguedashlineups.LeagueDashLineups(
            team_id_nullable=team_id,
            measure_type_detailed_defense="Advanced",
            per_mode_detailed="Per100Possessions",
            season=SEASON,
            season_type_all_star="Regular Season",
            group_quantity=5,
            timeout=120,
        )
        df = raw.get_data_frames()[0]
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"NBA API error: {e}")

    if df.empty:
        raise HTTPException(status_code=404, detail="No lineup data found for this team.")

    df = df[df["MIN"] >= min_minutes].copy()
    if df.empty:
        raise HTTPException(status_code=404, detail=f"No lineups with >= {min_minutes} minutes.")

    df = df.sort_values("NET_RATING", ascending=False)

    lineups = []
    for _, row in df.head(15).iterrows():
        group = str(row.get("GROUP_NAME", ""))
        players = [p.strip() for p in group.split(" - ") if p.strip()]
        lineups.append({
            "players": players,
            "net_rating": round(float(row.get("NET_RATING", 0)), 1),
            "off_rating": round(float(row.get("OFF_RATING", 0)), 1),
            "def_rating": round(float(row.get("DEF_RATING", 0)), 1),
            "minutes": round(float(row.get("MIN", 0)), 1),
            "gp": int(row.get("GP", 0)),
            "w": int(row.get("W", 0)),
            "l": int(row.get("L", 0)),
        })

    team_name = next(
        (t["full_name"] for t in static_teams.get_teams() if t["id"] == team_id),
        f"Team #{team_id}",
    )

    return {
        "team_id": team_id,
        "team_name": team_name,
        "season": SEASON,
        "lineups": lineups,
        "total_lineups_analyzed": len(df),
    }


@router.get("/teams")
def all_teams():
    teams = sorted(static_teams.get_teams(), key=lambda t: t["full_name"])
    return [{"id": t["id"], "name": t["full_name"], "abbreviation": t["abbreviation"]} for t in teams]
