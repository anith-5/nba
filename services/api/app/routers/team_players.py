"""Full franchise history for HoopIQ Arena's Closest To game mode.

Unlike rosters.py (current-season roster only), this walks every season since
a franchise's founding via nba_api's per-season CommonTeamRoster + season-wide
LeagueDashPlayerStats, so the Closest To player-selection panel can show every
player who ever played for that team with real season-by-season PPG. The
Node arena-realtime server caches the (potentially slow, many-sequential-call)
response per team for 24h -- see services/arena-realtime/src/data/teamPlayersCache.js.

PPG accuracy note: stats.nba.com throttles/times out under sustained
sequential load (confirmed empirically -- a full franchise walk is 60-160+
calls). When that happens for a given season, we do NOT silently record
PPG as 0 (that previously produced false zeros for real players, e.g. an
entire season's worth of Lakers players showing 0 PPG because the stats call
failed, not because anyone actually scored zero). Instead each season entry
carries `ppg_confirmed`: true only if a real non-failing stats response was
obtained for that player+season (after one retry), false otherwise -- and
`ppg` is null when unconfirmed. Callers (Node's cache + the game logic) are
expected to exclude ppg_confirmed=false seasons from anything player-facing,
and retry them later in the background (see /team-players/{abbr}/season/{season}).
"""

from __future__ import annotations

import time
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from nba_api.stats.endpoints import commonteamroster, leaguedashplayerstats
from nba_api.stats.static import teams as static_teams

from app.utils.season import get_current_nba_season_start_year

router = APIRouter(prefix="/api/arena", tags=["arena"])

# The upper bound of the founding-year-to-now walk below -- computed fresh
# (see app/utils/season.py) so the most recent season is always included as
# time passes, rather than the walk silently stopping at a season that was
# "current" when this was last hand-edited. This is about correctly
# identifying what "now" is, not a change to Closest To's All-Time mode's
# fixed-historical-range intent -- the walk still starts at each franchise's
# founding year exactly as before.
CURRENT_SEASON_START_YEAR = get_current_nba_season_start_year()
STATS_RETRY_DELAY_SECONDS = 2.0


def _season_str(start_year: int) -> str:
    return f"{start_year}-{str(start_year + 1)[-2:]}"


def _get_team(abbr: str) -> dict[str, Any]:
    team = next((t for t in static_teams.get_teams() if t["abbreviation"] == abbr), None)
    if not team:
        raise HTTPException(status_code=404, detail=f"Unknown team abbreviation: {abbr}")
    return team


def _retry(fn, attempts: int = 2, delay: float = 0.3):
    last_err: Exception | None = None
    for i in range(attempts):
        try:
            return fn()
        except Exception as exc:  # noqa: BLE001
            last_err = exc
            if i < attempts - 1:
                time.sleep(delay)
    raise last_err  # type: ignore[misc]


def _height_inches(height_str: str) -> int:
    try:
        feet_s, inches_s = str(height_str).split("-")
        return int(feet_s) * 12 + int(inches_s)
    except (ValueError, AttributeError):
        return 78


def _refine_position(raw_position: str, ast_pg: float, reb_pg: float, height_in: int) -> str:
    """CommonTeamRoster's POSITION field is coarse (G, F, C, G-F, F-C) -- split
    guard/forward hybrids using assist rate and height, same approach as
    rosters.py's _refine_position, just duplicated here since this endpoint's
    season-by-season loop shapes the inputs slightly differently.
    """
    parts = (raw_position or "").upper().split("-")
    is_guard, is_forward, is_center = "G" in parts, "F" in parts, "C" in parts

    if is_guard and is_forward:
        return "SF" if height_in >= 79 else "SG"
    if is_forward and is_center:
        return "PF"
    if is_guard:
        return "PG" if ast_pg >= 4.5 else "SG"
    if is_forward:
        return "PF" if height_in >= 81 or reb_pg >= 7 else "SF"
    if is_center:
        return "C"
    return "SF"


def _fetch_dash_stats(season: str) -> dict[int, dict[str, float]] | None:
    """Season-wide per-player stats, used to derive PPG. Returns None (not an
    empty dict) if the call never produced a usable result even after one
    retry -- None is the "totally unavailable" signal that must NOT be
    treated the same as "call succeeded but this particular player had 0
    games" (that's a real, valid stats_by_id dict that simply omits them).
    """
    for attempt in range(2):  # initial attempt + exactly one retry
        try:
            dash = leaguedashplayerstats.LeagueDashPlayerStats(season=season, timeout=8)
            drs = dash.get_dict()["resultSets"][0]
            rows = drs["rowSet"]
            if not rows:
                raise ValueError("LeagueDashPlayerStats returned an empty result set")
            didx = {h: i for i, h in enumerate(drs["headers"])}
            stats_by_id: dict[int, dict[str, float]] = {}
            for row in rows:
                gp = row[didx["GP"]] or 0
                if not gp:
                    continue
                stats_by_id[row[didx["PLAYER_ID"]]] = {
                    "ppg": round(row[didx["PTS"]] / gp, 1),
                    "ast_pg": round(row[didx["AST"]] / gp, 1),
                    "reb_pg": round(row[didx["REB"]] / gp, 1),
                }
            return stats_by_id
        except Exception:  # noqa: BLE001
            if attempt == 0:
                time.sleep(STATS_RETRY_DELAY_SECONDS)
                continue
            return None
    return None  # unreachable, keeps type-checkers happy


def _fetch_season_roster_with_stats(team: dict[str, Any], season: str) -> list[dict[str, Any]]:
    """Roster + PPG for exactly one team+season. Returns a list of
    {player_id, name, ppg, position, ppg_confirmed} -- empty list if the
    roster call itself fails (that season effectively didn't happen for this
    team as far as we can tell) or has no rows.
    """
    try:
        roster = _retry(lambda: commonteamroster.CommonTeamRoster(team_id=team["id"], season=season, timeout=6))
        rs = roster.get_dict()["resultSets"][0]
        idx = {h: i for i, h in enumerate(rs["headers"])}
        rows = rs["rowSet"]
    except Exception:  # noqa: BLE001
        return []
    if not rows:
        return []

    stats_by_id = _fetch_dash_stats(season)

    out = []
    for row in rows:
        player_id = row[idx["PLAYER_ID"]]
        name = row[idx["PLAYER"]]
        height_in = _height_inches(row[idx["HEIGHT"]])
        stats = stats_by_id.get(player_id) if stats_by_id is not None else None

        ppg_confirmed = stats is not None
        ppg = stats["ppg"] if stats is not None else None
        position = _refine_position(
            row[idx["POSITION"]],
            stats["ast_pg"] if stats else 0.0,
            stats["reb_pg"] if stats else 0.0,
            height_in,
        )
        out.append({
            "player_id": str(player_id),
            "name": name,
            "ppg": ppg,
            "position": position,
            "ppg_confirmed": ppg_confirmed,
        })
    return out


def fetch_team_players(abbr: str, season_delay: float = 0.1) -> dict[str, Any]:
    team = _get_team(abbr)
    start_year = team.get("year_founded") or 1976
    players_by_id: dict[str, dict[str, Any]] = {}

    for year in range(start_year, CURRENT_SEASON_START_YEAR + 1):
        season = _season_str(year)
        season_rows = _fetch_season_roster_with_stats(team, season)

        for row in season_rows:
            entry = players_by_id.setdefault(
                row["player_id"], {"name": row["name"], "player_id": row["player_id"], "seasons": {}}
            )
            entry["seasons"][season] = {
                "season": season,
                "ppg": row["ppg"],
                "position": row["position"],
                "ppg_confirmed": row["ppg_confirmed"],
            }

        if season_rows:
            time.sleep(season_delay)  # stay polite to stats.nba.com across dozens of sequential calls

    players = []
    for entry in players_by_id.values():
        seasons = sorted(entry["seasons"].values(), key=lambda s: s["season"], reverse=True)
        players.append({"name": entry["name"], "player_id": entry["player_id"], "seasons": seasons})

    return {
        "team_name": team["full_name"],
        "data_complete": True,
        "source": "live",
        "players": players,
    }


@router.get("/team-players/{abbr}")
def get_team_players(abbr: str, season_delay: float = Query(0.1, ge=0.0, le=5.0)):
    return fetch_team_players(abbr.upper(), season_delay=season_delay)


@router.get("/team-players/{abbr}/season/{season}")
def retry_team_season(abbr: str, season: str):
    """Re-fetches just one team+season -- used by the Node cache's background
    retry loop to fill in seasons that were marked ppg_confirmed=false on the
    initial pass, without re-walking the entire franchise history again.
    """
    team = _get_team(abbr.upper())
    rows = _fetch_season_roster_with_stats(team, season)
    return {"team_name": team["full_name"], "season": season, "players": rows}
