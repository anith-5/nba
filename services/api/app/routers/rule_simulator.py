"""Rule Change Simulator -- what a rule change would do to every player and team.

HOW IT WORKS
------------
Every player gets a points-per-game change, computed from their OWN shot
profile rather than a league-wide coefficient: how many corner threes they
take, how many shots they get in the paint, how often they pull up from 30+
feet. Team changes are then the sum of their players' changes, weighted by
games played -- so a team's number is literally made of its players', and the
two can never disagree.

This replaces a model that computed teams separately from team-level stats.
That model read PACE and PTS_PAINT, which LeagueDashTeamStats does not return
in the Base measure, so both silently fell back to defaults: the shot-clock
scenario gave every team exactly +1.5, and the wider-lane scenario gave every
team a value under the display cutoff, so it showed no teams at all. Showing
only the top and bottom five hid both.

WHAT IT IS AND ISN'T
--------------------
A static estimate: the shots each player actually took this season, re-priced
under the new rule. It does not model how players or coaches would adapt --
nobody keeps taking corner threes worth two points. So read the numbers as
"the immediate cost or gain if nothing else changed", which is a floor on the
real effect, not a forecast of it. The coefficients are listed in ASSUMPTIONS
and returned to the UI so the result is never a black box.

DATA
----
Three league-wide calls, cached to data_cache/ and served from there on the
cloud (see data_cache.cached_or_live):
  - LeagueDashPlayerStats, Base per game     -> scoring, volume, turnovers
  - LeagueDashPlayerShotLocations, By Zone   -> corner threes, paint shots
  - LeagueDashPlayerShotLocations, 5ft Range -> shots from 30+ feet
"""

from __future__ import annotations

import asyncio
import time
from enum import Enum
from typing import Any, Optional

from fastapi import APIRouter, HTTPException
from nba_api.stats.endpoints import (
    leaguedashplayershotlocations,
    leaguedashplayerstats,
    leaguedashteamstats,
)
from nba_api.stats.static import teams as static_teams
from pydantic import BaseModel

from app import data_cache
from app.config import settings

router = APIRouter(prefix="/rules", tags=["rules"])
SEASON = settings.current_season
RULES_CACHE = "rule_sim_data.json"

_data: Optional[dict] = None  # process-lifetime memo of the loaded dataset


class RuleScenario(str, Enum):
    THREE_POINT_BACK = "three_point_back"
    NO_CORNER_THREE = "no_corner_three"
    WIDER_LANE = "wider_lane"
    FOUR_POINT_LINE = "four_point_line"
    SHORTER_SHOT_CLOCK = "shorter_shot_clock"


SCENARIO_META = {
    RuleScenario.THREE_POINT_BACK: {
        "label": "Move 3-Point Line Back 2 Feet",
        "description": "The 3-point line moves from 23'9\" to 25'9\". Every three gets harder, so high-volume shooters lose the most.",
    },
    RuleScenario.NO_CORNER_THREE: {
        "label": "Eliminate Corner 3-Pointers",
        "description": "Corner 3s count as 2-point shots. Players who live in the corners take the biggest hit.",
    },
    RuleScenario.WIDER_LANE: {
        "label": "Widen the Lane (16→20 ft)",
        "description": "The paint widens by 4 feet. Paint scorers get more room to operate; corner shooters lose a little space.",
    },
    RuleScenario.FOUR_POINT_LINE: {
        "label": "Add a 4-Point Line (30+ ft)",
        "description": "Shots from 30+ feet are worth 4. Deep-range shooters gain; everyone else is roughly unchanged.",
    },
    RuleScenario.SHORTER_SHOT_CLOCK: {
        "label": "Shorten Shot Clock to 18 Seconds",
        "description": "6 fewer seconds per possession means more possessions, but more rushed shots and turnovers.",
    },
}

# --- Model coefficients -------------------------------------------------------
# Each is a single, named assumption so the model can be read and argued with.

# Three-point percentage falls roughly 1.5 points for each foot of added
# distance across the 22-28 ft range, so a 2 ft move costs about 3 points.
THREE_PCT_DROP_PER_FOOT = 0.015
LINE_MOVE_FEET = 2

# A wider lane gives paint shots a little more room (+2 pts of FG%), and brings
# the lane edge closer to the corner, crowding corner threes slightly (-1 pt).
LANE_PAINT_FG_BOOST = 0.02
LANE_CORNER_FG_PENALTY = 0.01

# 18 seconds instead of 24: not every possession uses the full clock, so the
# gain in possessions is closer to 6% than the 25% the raw numbers suggest.
# More possessions come with rushed shots (-1 pt FG%) and more turnovers (+10%).
SHOT_CLOCK_EXTRA_POSSESSIONS = 0.06
SHOT_CLOCK_RUSHED_FG_DROP = 0.01
SHOT_CLOCK_EXTRA_TOV_RATE = 0.10
POINTS_PER_POSSESSION = 1.1  # league-average value of a possession lost to a turnover

ASSUMPTIONS = {
    RuleScenario.THREE_POINT_BACK: [
        f"Three-point % drops about {THREE_PCT_DROP_PER_FOOT * 100:.1f} points per foot of added distance.",
        "Every three a player takes is re-priced at the lower make rate.",
    ],
    RuleScenario.NO_CORNER_THREE: [
        "Every made corner three is re-scored as a two: one point lost per make.",
        "Uses each player's actual corner-three makes this season.",
    ],
    RuleScenario.WIDER_LANE: [
        f"Paint shots convert about {LANE_PAINT_FG_BOOST * 100:.0f} points better with more room.",
        f"Corner threes convert about {LANE_CORNER_FG_PENALTY * 100:.0f} point worse as the lane edge moves closer.",
    ],
    RuleScenario.FOUR_POINT_LINE: [
        "Every made shot from 30+ feet is re-scored as a four: one point gained per make.",
        "Uses each player's actual 30+ ft makes this season.",
    ],
    RuleScenario.SHORTER_SHOT_CLOCK: [
        f"About {SHOT_CLOCK_EXTRA_POSSESSIONS * 100:.0f}% more possessions, scaling scoring up.",
        f"Rushed shots convert about {SHOT_CLOCK_RUSHED_FG_DROP * 100:.0f} point worse.",
        f"Turnovers rise about {SHOT_CLOCK_EXTRA_TOV_RATE * 100:.0f}%, each costing a possession.",
    ],
}
ALWAYS = "Static estimate: this season's shots re-priced under the new rule. It does not model players or teams adapting."


# --- Data loading -------------------------------------------------------------

def _sleep():
    time.sleep(0.7)  # stay polite to stats.nba.com between league-wide calls


def _num(v) -> float:
    try:
        f = float(v)
        return f if f == f else 0.0  # NaN -> 0
    except (TypeError, ValueError):
        return 0.0


def _zone_totals(df, zones: list[str], stat: str) -> dict[int, float]:
    """Sum one stat across several shot-location zones, per player id."""
    out: dict[int, float] = {}
    id_col = ("", "PLAYER_ID")
    present = [z for z in zones if (z, stat) in df.columns]
    for _, row in df.iterrows():
        out[int(row[id_col])] = sum(_num(row[(z, stat)]) for z in present)
    return out


def _fetch_rule_data_live() -> dict:
    """Pull and join everything the model needs. JSON-serialisable, for caching.

    Season TOTALS, divided by games played here -- never the PerGame mode. NBA
    rounds per-game values to one decimal, so a player making 0.04 shots a game
    from 30+ ft comes back as 0.0 and simply vanishes. That erased seven whole
    teams from the 4-point-line scenario, which is exactly the rare-event data
    the model runs on.
    """
    base = leaguedashplayerstats.LeagueDashPlayerStats(
        season=SEASON, per_mode_detailed="Totals", timeout=90,
    ).get_data_frames()[0]
    if base.empty:
        raise ValueError(f"No player stats returned for {SEASON}")
    _sleep()

    zones = leaguedashplayershotlocations.LeagueDashPlayerShotLocations(
        season=SEASON, distance_range="By Zone", per_mode_detailed="Totals", timeout=90,
    ).get_data_frames()[0]
    _sleep()

    ranges = leaguedashplayershotlocations.LeagueDashPlayerShotLocations(
        season=SEASON, distance_range="5ft Range", per_mode_detailed="Totals", timeout=90,
    ).get_data_frames()[0]
    _sleep()

    team_df = leaguedashteamstats.LeagueDashTeamStats(
        season=SEASON, measure_type_detailed_defense="Base", per_mode_detailed="PerGame", timeout=90,
    ).get_data_frames()[0]

    # "Corner 3" is the league's own combined left+right corner zone.
    corner_fga = _zone_totals(zones, ["Corner 3"], "FGA")
    corner_fgm = _zone_totals(zones, ["Corner 3"], "FGM")
    paint = ["Restricted Area", "In The Paint (Non-RA)"]
    paint_fga = _zone_totals(zones, paint, "FGA")
    deep = ["30-34 ft.", "35-39 ft.", "40+ ft."]
    deep_fga = _zone_totals(ranges, deep, "FGA")
    deep_fgm = _zone_totals(ranges, deep, "FGM")

    players = []
    for _, r in base.iterrows():
        pid = int(r["PLAYER_ID"])
        gp = int(_num(r["GP"]))
        if gp <= 0:
            continue
        per_game = lambda total: total / gp  # noqa: E731 -- full precision, see docstring
        players.append({
            "id": pid,
            "name": str(r["PLAYER_NAME"]),
            "team": str(r["TEAM_ABBREVIATION"]),
            "gp": gp,
            "min": round(per_game(_num(r["MIN"])), 1),
            "pts": round(per_game(_num(r["PTS"])), 1),
            "fga": per_game(_num(r["FGA"])),
            "fg3a": per_game(_num(r["FG3A"])),
            "tov": per_game(_num(r["TOV"])),
            "corner3_fga": per_game(corner_fga.get(pid, 0.0)),
            "corner3_fgm": per_game(corner_fgm.get(pid, 0.0)),
            "paint_fga": per_game(paint_fga.get(pid, 0.0)),
            "deep_fga": per_game(deep_fga.get(pid, 0.0)),
            "deep_fgm": per_game(deep_fgm.get(pid, 0.0)),
        })

    # LeagueDashTeamStats has no abbreviation column; map via the static list.
    abbr_by_id = {t["id"]: t["abbreviation"] for t in static_teams.get_teams()}
    teams = {}
    for _, r in team_df.iterrows():
        abbr = abbr_by_id.get(int(r["TEAM_ID"]))
        if abbr:
            teams[abbr] = {"name": str(r["TEAM_NAME"]), "gp": int(_num(r["GP"])), "pts": round(_num(r["PTS"]), 1)}

    return {"season": SEASON, "players": players, "teams": teams}


def _load() -> dict:
    global _data
    if _data is None:
        _data = data_cache.cached_or_live(RULES_CACHE, _fetch_rule_data_live)
    return _data


# --- Model --------------------------------------------------------------------

def _player_change(p: dict, scenario: RuleScenario) -> tuple[float, str]:
    """(points-per-game change, a one-line reason specific to this player)."""
    if scenario == RuleScenario.THREE_POINT_BACK:
        drop = THREE_PCT_DROP_PER_FOOT * LINE_MOVE_FEET
        delta = -p["fg3a"] * drop * 3
        return delta, f"{p['fg3a']:.1f} threes a game, each about {drop * 100:.0f} points harder to make"

    if scenario == RuleScenario.NO_CORNER_THREE:
        delta = -p["corner3_fgm"]
        return delta, f"{p['corner3_fgm']:.1f} made corner threes a game would count as twos"

    if scenario == RuleScenario.WIDER_LANE:
        gain = p["paint_fga"] * LANE_PAINT_FG_BOOST * 2
        loss = p["corner3_fga"] * LANE_CORNER_FG_PENALTY * 3
        return gain - loss, (
            f"{p['paint_fga']:.1f} paint shots a game get more room; "
            f"{p['corner3_fga']:.1f} corner threes get slightly crowded"
        )

    if scenario == RuleScenario.FOUR_POINT_LINE:
        delta = p["deep_fgm"]
        return delta, f"{p['deep_fgm']:.2f} made shots from 30+ ft a game would be worth 4"

    if scenario == RuleScenario.SHORTER_SHOT_CLOCK:
        more = p["pts"] * SHOT_CLOCK_EXTRA_POSSESSIONS
        rushed = p["fga"] * SHOT_CLOCK_RUSHED_FG_DROP * 2
        turnovers = p["tov"] * SHOT_CLOCK_EXTRA_TOV_RATE * POINTS_PER_POSSESSION
        return more - rushed - turnovers, (
            f"more possessions on {p['pts']:.1f} PPG, offset by rushed shots "
            f"and {p['tov']:.1f} turnovers a game"
        )

    return 0.0, ""


def _simulate(scenario: RuleScenario) -> dict:
    data = _load()
    players_out = []
    team_change: dict[str, float] = {}

    for p in data["players"]:
        delta, why = _player_change(p, scenario)
        players_out.append({
            "id": p["id"],
            "name": p["name"],
            "team": p["team"],
            "gp": p["gp"],
            "pts": p["pts"],
            "pts_change": round(delta, 2),
            "new_pts": round(p["pts"] + delta, 1),
            "detail": why,
        })
        # A player's per-game change counts toward his team only in the share
        # of its games he actually played, so a 10-game stint can't masquerade
        # as a full season's contribution.
        team = data["teams"].get(p["team"])
        if team and team["gp"]:
            weight = min(1.0, p["gp"] / team["gp"])
            team_change[p["team"]] = team_change.get(p["team"], 0.0) + delta * weight

    teams_out = [
        {
            "abbr": abbr,
            "name": t["name"],
            "pts": t["pts"],
            "pts_change": round(team_change.get(abbr, 0.0), 2),
            "new_pts": round(t["pts"] + team_change.get(abbr, 0.0), 1),
        }
        for abbr, t in data["teams"].items()
    ]
    teams_out.sort(key=lambda t: t["pts_change"], reverse=True)
    # Biggest movers first, so the best matches for a search rank sensibly.
    players_out.sort(key=lambda p: abs(p["pts_change"]), reverse=True)

    meta = SCENARIO_META[scenario]
    return {
        "scenario": scenario.value,
        "label": meta["label"],
        "description": meta["description"],
        "season": data.get("season", SEASON),
        "teams": teams_out,
        "players": players_out,
        "summary": {
            "players": len(players_out),
            "gain": sum(1 for p in players_out if p["pts_change"] > 0.05),
            "lose": sum(1 for p in players_out if p["pts_change"] < -0.05),
        },
        "assumptions": ASSUMPTIONS[scenario] + [ALWAYS],
        "methodology": (
            f"Each player's {data.get('season', SEASON)} shots re-priced under the new rule; "
            "team totals are the sum of their players, weighted by games played."
        ),
    }


class SimulateRequest(BaseModel):
    scenario: RuleScenario


@router.post("/simulate")
async def simulate_rule(body: SimulateRequest):
    try:
        return await asyncio.to_thread(_simulate, body.scenario)
    except Exception as e:  # noqa: BLE001 -- surfaced as a clear upstream error
        raise HTTPException(status_code=502, detail=f"NBA stats unavailable: {e}") from e


@router.get("/scenarios")
def list_scenarios():
    return [
        {"value": s.value, "label": SCENARIO_META[s]["label"], "description": SCENARIO_META[s]["description"]}
        for s in RuleScenario
    ]
