"""Lineup Optimizer - real 5-man lineups + XGBoost hypothetical lineup predictor."""

import time
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from nba_api.stats.endpoints import leaguedashlineups, commonteamroster
from nba_api.stats.static import teams as static_teams

from app.config import settings
import app.lineup_model as lineup_model

router = APIRouter(prefix="/lineups", tags=["lineups"])
SEASON = settings.current_season
MIN_MINUTES = 15.0


def _sleep():
    time.sleep(0.7)


# ── Real lineup data ──────────────────────────────────────────────────────────

@router.get("/teams")
def all_teams():
    teams = sorted(static_teams.get_teams(), key=lambda t: t["full_name"])
    return [{"id": t["id"], "name": t["full_name"], "abbreviation": t["abbreviation"]} for t in teams]


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


@router.get("/roster/{team_id}")
def current_roster(team_id: int):
    """Returns the actual current-season roster via CommonTeamRoster (reflects trades)."""
    _sleep()
    try:
        df = commonteamroster.CommonTeamRoster(
            team_id=team_id,
            season=SEASON,
            timeout=60,
        ).get_data_frames()[0]
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"NBA API error: {e}")

    if df.empty:
        raise HTTPException(status_code=404, detail="Roster not found.")

    players = []
    for _, r in df.iterrows():
        players.append({
            "player_id": int(r.get("PLAYER_ID", 0)),
            "name": str(r.get("PLAYER", "")),
            "number": str(r.get("NUM", "")),
            "position": str(r.get("POSITION", "")),
            "height": str(r.get("HEIGHT", "")),
            "age": int(r.get("AGE", 0) or 0),
        })

    team_name = next(
        (t["full_name"] for t in static_teams.get_teams() if t["id"] == team_id),
        f"Team #{team_id}",
    )

    return {"team_id": team_id, "team_name": team_name, "season": SEASON, "players": players}


# ── XGBoost model endpoints ───────────────────────────────────────────────────

@router.post("/model/train")
def train_model():
    if lineup_model._is_training:
        raise HTTPException(409, "Model is already training.")
    if lineup_model.is_trained():
        return {"status": "already_trained", **lineup_model.get_status()}
    try:
        return lineup_model.train()
    except RuntimeError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, str(e))


@router.get("/model/status")
def model_status():
    return lineup_model.get_status()


class PredictRequest(BaseModel):
    player_ids: list[int]


@router.post("/predict")
def predict_lineup(body: PredictRequest):
    if len(body.player_ids) != 5:
        raise HTTPException(400, "Exactly 5 player IDs required.")
    if not lineup_model.is_trained():
        raise HTTPException(400, "Model not trained. POST /lineups/model/train first.")
    try:
        return lineup_model.predict_lineup(body.player_ids)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, str(e))


@router.get("/players/search")
def search_players_live(q: str, limit: int = 10):
    """
    Search from live-trained player pool (reflects current team assignments).
    Falls back to static list if model not trained.
    """
    if lineup_model.is_trained():
        return lineup_model.search_players_from_model(q, limit)

    from nba_api.stats.static import players as static_players
    q_low = q.strip().lower()
    matches = [
        {"id": p["id"], "full_name": p["full_name"], "team": ""}
        for p in static_players.get_players()
        if q_low in p["full_name"].lower() and p.get("is_active", False)
    ]
    return matches[:limit]
