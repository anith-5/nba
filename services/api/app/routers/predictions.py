"""Baseline game prediction — replace with ML model in Phase 3."""

import math

from fastapi import APIRouter
from pydantic import BaseModel, Field

router = APIRouter(prefix="/predictions", tags=["predictions"])


class GamePredictionRequest(BaseModel):
    home_team_id: int
    away_team_id: int
    home_win_pct: float = Field(0.5, ge=0, le=1, description="Season win % proxy")
    away_win_pct: float = Field(0.5, ge=0, le=1)
    home_rest_days: int = Field(1, ge=0, le=7)
    away_rest_days: int = Field(1, ge=0, le=7)


class GamePredictionResponse(BaseModel):
    home_win_prob: float
    away_win_prob: float
    projected_home_score: float
    projected_away_score: float
    confidence: str
    upset_alert: bool
    model_version: str
    notes: str


@router.post("/game", response_model=GamePredictionResponse)
def predict_game(body: GamePredictionRequest):
    # Heuristic: win% + home court (+3.5 pts) + rest edge
    home_court_pts = 3.5
    rest_edge = (body.home_rest_days - body.away_rest_days) * 0.4

    home_strength = body.home_win_pct * 100 + home_court_pts + rest_edge
    away_strength = body.away_win_pct * 100

    diff = home_strength - away_strength
    home_win_prob = 1 / (1 + math.exp(-diff / 8))
    away_win_prob = 1 - home_win_prob

    league_avg = 114.0
    projected_home = league_avg + (body.home_win_pct - 0.5) * 12 + home_court_pts / 2
    projected_away = league_avg + (body.away_win_pct - 0.5) * 12

    confidence = "high" if abs(home_win_prob - 0.5) > 0.2 else "medium" if abs(home_win_prob - 0.5) > 0.1 else "low"
    upset_alert = (home_win_prob < 0.4 and body.home_win_pct > body.away_win_pct) or (
        home_win_prob > 0.6 and body.home_win_pct < body.away_win_pct
    )

    return GamePredictionResponse(
        home_win_prob=round(home_win_prob, 3),
        away_win_prob=round(away_win_prob, 3),
        projected_home_score=round(projected_home, 1),
        projected_away_score=round(projected_away, 1),
        confidence=confidence,
        upset_alert=upset_alert,
        model_version="heuristic_v0.1",
        notes="Baseline heuristic. ML pipeline will replace this in Phase 3.",
    )
