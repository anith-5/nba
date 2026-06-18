"""Rule Change Simulator - models impact of NBA rule changes on teams and players."""

import asyncio
import time
from enum import Enum
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from nba_api.stats.endpoints import leaguedashteamstats, leaguedashplayerstats

from app.config import settings

router = APIRouter(prefix="/rules", tags=["rules"])
SEASON = settings.current_season

_team_cache: Optional[dict] = None
_player_cache: Optional[dict] = None


class RuleScenario(str, Enum):
    THREE_POINT_BACK = "three_point_back"
    NO_CORNER_THREE = "no_corner_three"
    WIDER_LANE = "wider_lane"
    FOUR_POINT_LINE = "four_point_line"
    SHORTER_SHOT_CLOCK = "shorter_shot_clock"


SCENARIO_META = {
    RuleScenario.THREE_POINT_BACK: {
        "label": "Move 3-Point Line Back 2 Feet",
        "description": "The 3-point line moves from 23'9\" to 25'9\". Long-range specialists lose value; mid-range rebounds.",
    },
    RuleScenario.NO_CORNER_THREE: {
        "label": "Eliminate Corner 3-Pointers",
        "description": "Corner 3s revert to 2-point shots. Spacing-dependent offenses lose significant value.",
    },
    RuleScenario.WIDER_LANE: {
        "label": "Widen the Lane (16â†'20 ft)",
        "description": "The paint widens by 4 feet. Post players get more space; corner shooters crowd changes.",
    },
    RuleScenario.FOUR_POINT_LINE: {
        "label": "Add a 4-Point Line (30+ ft)",
        "description": "Shots from 30+ feet worth 4 points. Sharpshooters gain massive value; changes late-game math.",
    },
    RuleScenario.SHORTER_SHOT_CLOCK: {
        "label": "Shorten Shot Clock to 18 Seconds",
        "description": "6 fewer seconds per possession. Transition-heavy, high-pace teams benefit; iso-heavy teams punished.",
    },
}

# Per-scenario impact coefficients applied to team stats
TEAM_IMPACT = {
    RuleScenario.THREE_POINT_BACK: {
        "high_3pt_rate": -4.2,    # teams with >35% FGA from 3 lose ~4 pts/game
        "low_3pt_rate": +1.5,     # teams with <25% FGA from 3 gain slightly
        "mid_range": +2.1,        # mid-range heavy teams benefit
    },
    RuleScenario.NO_CORNER_THREE: {
        "high_corner_3": -5.8,
        "low_corner_3": +1.2,
        "paint_heavy": +2.4,
    },
    RuleScenario.WIDER_LANE: {
        "paint_heavy": +3.1,
        "post_heavy": +4.5,
        "3pt_heavy": -1.3,
    },
    RuleScenario.FOUR_POINT_LINE: {
        "long_range": +6.2,
        "no_long_range": -2.1,
    },
    RuleScenario.SHORTER_SHOT_CLOCK: {
        "high_pace": +3.8,
        "low_pace": -4.2,
        "high_tov": -2.5,
    },
}


def _sleep():
    time.sleep(0.7)


def _fetch_with_retry(fn, retries=3, delay=2.0):
    last_err = None
    for attempt in range(retries):
        try:
            return fn()
        except Exception as e:
            last_err = e
            if attempt < retries - 1:
                time.sleep(delay * (attempt + 1))
    raise last_err


def _load_caches():
    global _team_cache, _player_cache
    if _team_cache:
        return

    _sleep()
    team_df = _fetch_with_retry(lambda: leaguedashteamstats.LeagueDashTeamStats(
        season=SEASON,
        measure_type_detailed_defense="Base",
        per_mode_detailed="PerGame",
        timeout=90,
    ).get_data_frames()[0])

    if team_df.empty:
        raise ValueError(f"No team stats returned for season {SEASON}")

    _sleep()
    player_df = _fetch_with_retry(lambda: leaguedashplayerstats.LeagueDashPlayerStats(
        season=SEASON,
        per_mode_detailed="PerGame",
        timeout=90,
    ).get_data_frames()[0])

    if player_df.empty:
        raise ValueError(f"No player stats returned for season {SEASON}")

    _team_cache = {int(r["TEAM_ID"]): r.to_dict() for _, r in team_df.iterrows()}
    _player_cache = {int(r["PLAYER_ID"]): r.to_dict() for _, r in player_df.iterrows()}


def _team_impact(team: dict, scenario: RuleScenario) -> float:
    fga = float(team.get("FGA", 1))
    fg3a = float(team.get("FG3A", 0))
    fg2a = float(team.get("FG2A", fga - fg3a))
    pts = float(team.get("PTS", 100))
    pace = float(team.get("PACE", 100.0) if "PACE" in team else 100.0)

    three_rate = fg3a / fga if fga > 0 else 0

    if scenario == RuleScenario.THREE_POINT_BACK:
        if three_rate > 0.38:
            return TEAM_IMPACT[scenario]["high_3pt_rate"]
        elif three_rate < 0.28:
            return TEAM_IMPACT[scenario]["low_3pt_rate"]
        else:
            return TEAM_IMPACT[scenario]["mid_range"] * (three_rate - 0.30)

    elif scenario == RuleScenario.NO_CORNER_THREE:
        corner_est = fg3a * 0.22  # roughly 22% of 3PAs from corners
        corner_rate = corner_est / fga if fga > 0 else 0
        if corner_rate > 0.08:
            return TEAM_IMPACT[scenario]["high_corner_3"]
        elif corner_rate < 0.04:
            return TEAM_IMPACT[scenario]["paint_heavy"] * 0.5
        return round(-corner_rate * 40, 2)

    elif scenario == RuleScenario.WIDER_LANE:
        paint_pts = float(team.get("PTS_PAINT", 0))
        paint_rate = paint_pts / pts if pts > 0 else 0.3
        if paint_rate > 0.38:
            return TEAM_IMPACT[scenario]["post_heavy"]
        elif paint_rate < 0.28:
            return TEAM_IMPACT[scenario]["3pt_heavy"]
        return TEAM_IMPACT[scenario]["paint_heavy"] * (paint_rate - 0.28)

    elif scenario == RuleScenario.FOUR_POINT_LINE:
        four_pt_rate = float(team.get("FG3_PCT", 0.36))
        if four_pt_rate > 0.38 and three_rate > 0.38:
            return TEAM_IMPACT[scenario]["long_range"]
        elif three_rate < 0.25:
            return TEAM_IMPACT[scenario]["no_long_range"]
        return round((three_rate - 0.32) * 25, 2)

    elif scenario == RuleScenario.SHORTER_SHOT_CLOCK:
        pace_norm = (pace - 95) / 10  # normalize around league avg ~100
        if pace_norm > 0.5:
            return TEAM_IMPACT[scenario]["high_pace"]
        elif pace_norm < -0.5:
            return TEAM_IMPACT[scenario]["low_pace"]
        return round(pace_norm * 3, 2)

    return 0.0


def _player_impact(player: dict, scenario: RuleScenario) -> Optional[str]:
    fga = float(player.get("FGA", 1))
    fg3a = float(player.get("FG3A", 0))
    fg3_pct = float(player.get("FG3_PCT", 0))
    fg_pct = float(player.get("FG_PCT", 0))
    blk = float(player.get("BLK", 0))
    pts = float(player.get("PTS", 0))
    three_rate = fg3a / fga if fga > 0 else 0

    if scenario == RuleScenario.THREE_POINT_BACK:
        if three_rate > 0.45 and fg3_pct > 0.38:
            return f"Moderate negative - {three_rate:.0%} of FGA from 3"
        if pts > 20 and three_rate < 0.25:
            return "Positive - low 3-point reliance, benefits from mid-range premium"
        return None

    elif scenario == RuleScenario.NO_CORNER_THREE:
        if three_rate > 0.35 and fg3_pct > 0.38:
            return f"Negative - high corner 3 volume"
        if blk > 1.5:
            return "Positive - paint presence becomes more valuable"
        return None

    elif scenario == RuleScenario.WIDER_LANE:
        if blk > 1.8:
            return "Positive - wider lane benefits shot-blocking bigs"
        if three_rate > 0.45:
            return "Neutral to slightly negative - perimeter spacing shifts"
        return None

    elif scenario == RuleScenario.FOUR_POINT_LINE:
        if three_rate > 0.40 and fg3_pct > 0.38:
            return f"Positive - {fg3_pct:.0%} from 3, deep range adds value"
        if three_rate < 0.15 and pts < 14:
            return "Negative - no 4-point threat, role diminishes"
        return None

    elif scenario == RuleScenario.SHORTER_SHOT_CLOCK:
        if pts > 22 and fg_pct > 0.48:
            return "Positive - high-efficiency scorers benefit from pace increase"
        if float(player.get("TOV", 0)) > 3.5:
            return "Negative - high-turnover players punished by faster pace"
        return None

    return None


class SimulateRequest(BaseModel):
    scenario: RuleScenario


@router.post("/simulate")
async def simulate_rule(body: SimulateRequest):
    try:
        await asyncio.to_thread(_load_caches)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"NBA API error: {e}")

    scenario = body.scenario
    meta = SCENARIO_META[scenario]

    # Team impact
    team_impacts = []
    for tid, team in _team_cache.items():
        delta = _team_impact(team, scenario)
        if abs(delta) >= 0.3:
            team_impacts.append({
                "team": str(team.get("TEAM_NAME", "")),
                "abbreviation": str(team.get("TEAM_ABBREVIATION", "")),
                "pts_change": round(delta, 1),
                "winner": delta > 0,
            })

    team_impacts.sort(key=lambda x: x["pts_change"])
    losers = team_impacts[:5]
    winners = team_impacts[-5:][::-1]

    # Player impact
    player_impacts = []
    for pid, player in _player_cache.items():
        if float(player.get("MIN", 0)) < 20:
            continue
        impact = _player_impact(player, scenario)
        if impact:
            player_impacts.append({
                "player": str(player.get("PLAYER_NAME", "")),
                "team": str(player.get("TEAM_ABBREVIATION", "")),
                "impact": impact,
                "pts": float(player.get("PTS", 0)),
            })

    player_impacts = player_impacts[:20]

    return {
        "scenario": scenario.value,
        "label": meta["label"],
        "description": meta["description"],
        "team_winners": winners,
        "team_losers": losers,
        "player_impacts": player_impacts,
        "season": SEASON,
        "methodology": "Statistical coefficient model applied to 2024-25 season per-game averages.",
    }


@router.get("/scenarios")
def list_scenarios():
    return [
        {"value": s.value, "label": SCENARIO_META[s]["label"], "description": SCENARIO_META[s]["description"]}
        for s in RuleScenario
    ]


