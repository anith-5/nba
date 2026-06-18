"""Live Win Probability - mathematical model on live scoreboard data."""

import math
import re
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.nba_client import get_live_scoreboard

router = APIRouter(prefix="/win-probability", tags=["win-probability"])

SIGMA = 11.0  # empirical NBA score-diff standard deviation


def _norm_cdf(x: float) -> float:
    return 0.5 * (1 + math.erf(x / math.sqrt(2)))


def _parse_clock(clock_str: str, period: int) -> float:
    """Returns minutes elapsed in the game (0–48 for regulation)."""
    match = re.search(r"PT(\d+)M([\d.]+)S", clock_str or "")
    if not match:
        return min(period * 12.0, 48.0)
    mins_left = float(match.group(1)) + float(match.group(2)) / 60
    done_in_period = 12.0 - mins_left
    base = (min(period, 4) - 1) * 12.0
    return max(0.0, base + done_in_period)


def _compute_prob(score_diff: int, minutes_elapsed: float) -> float:
    minutes_remaining = max(48.0 - minutes_elapsed, 0.0)
    if minutes_remaining <= 0:
        return 1.0 if score_diff > 0 else (0.5 if score_diff == 0 else 0.0)
    std = SIGMA * math.sqrt(minutes_remaining / 48.0)
    return round(_norm_cdf(score_diff / std), 3)


@router.get("/live")
def live_win_probabilities():
    try:
        payload, source = get_live_scoreboard()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Scoreboard error: {e}")

    games = payload.get("scoreboard", {}).get("games", [])
    if not games:
        games = payload.get("games", [])

    results = []
    for g in games:
        status = g.get("gameStatus", 0)
        period = g.get("period", 1)
        clock = g.get("gameClock", "")

        home = g.get("homeTeam", {})
        away = g.get("awayTeam", {})

        home_score = int(home.get("score", 0) or 0)
        away_score = int(away.get("score", 0) or 0)
        score_diff = home_score - away_score

        elapsed = _parse_clock(clock, period)
        is_final = status == 3
        is_live = status == 2

        home_prob = _compute_prob(score_diff, elapsed) if is_live else (
            1.0 if score_diff > 0 else (0.5 if score_diff == 0 else 0.0)
        )

        results.append({
            "game_id": g.get("gameId"),
            "home_team": home.get("teamAbbreviation", home.get("teamCity", "")),
            "away_team": away.get("teamAbbreviation", away.get("teamCity", "")),
            "home_score": home_score,
            "away_score": away_score,
            "period": period,
            "clock": clock,
            "status": "Final" if is_final else ("Live" if is_live else "Upcoming"),
            "home_win_prob": round(home_prob, 3),
            "away_win_prob": round(1 - home_prob, 3),
            "minutes_elapsed": round(elapsed, 1),
        })

    return {"games": results, "source": source}


class CalcRequest(BaseModel):
    score_diff: int   # home minus away (positive = home winning)
    minutes_elapsed: float  # 0-48


@router.post("/calculate")
def calculate_win_prob(body: CalcRequest):
    prob = _compute_prob(body.score_diff, body.minutes_elapsed)
    return {
        "home_win_prob": prob,
        "away_win_prob": round(1 - prob, 3),
        "minutes_remaining": round(max(48.0 - body.minutes_elapsed, 0.0), 1),
        "model": "gaussian_diffusion_v1",
    }
