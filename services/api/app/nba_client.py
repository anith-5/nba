"""Thin wrappers around nba_api with consistent error handling."""

from __future__ import annotations

import time
from typing import Any

from app.scoreboard_service import get_scoreboard
from nba_api.stats.endpoints import commonplayerinfo, playercareerstats
from nba_api.stats.static import players as static_players
from nba_api.stats.static import teams as static_teams


def _retry(callable_fn, attempts: int = 3, delay: float = 0.6):
    last_err: Exception | None = None
    for i in range(attempts):
        try:
            return callable_fn()
        except Exception as exc:  # noqa: BLE001
            last_err = exc
            if i < attempts - 1:
                time.sleep(delay * (i + 1))
    raise last_err  # type: ignore[misc]


def get_live_scoreboard() -> tuple[dict[str, Any], str]:
    return get_scoreboard()


def get_all_teams() -> list[dict[str, Any]]:
    teams = static_teams.get_teams()
    return sorted(teams, key=lambda t: t.get("full_name", ""))


def search_players(query: str, limit: int = 20) -> list[dict[str, Any]]:
    q = query.strip().lower()
    if not q:
        return []
    all_players = static_players.get_players()
    matches = [
        p
        for p in all_players
        if q in p.get("full_name", "").lower() or q in p.get("last_name", "").lower()
    ]
    return matches[:limit]


def _per_game_row(row: dict) -> dict:
    """Compute per-game + shooting-efficiency stats from a season/career totals row."""
    gp  = float(row.get("GP", 0) or 0)
    pts = float(row.get("PTS", 0) or 0)
    reb = float(row.get("REB", 0) or 0)
    ast = float(row.get("AST", 0) or 0)
    stl = float(row.get("STL", 0) or 0)
    blk = float(row.get("BLK", 0) or 0)
    tov = float(row.get("TOV", 0) or 0)
    min_ = float(row.get("MIN", 0) or 0)
    fga = float(row.get("FGA", 0) or 0)
    fgm = float(row.get("FGM", 0) or 0)
    fg3a = float(row.get("FG3A", 0) or 0)
    fg3m = float(row.get("FG3M", 0) or 0)
    fta = float(row.get("FTA", 0) or 0)
    ftm = float(row.get("FTM", 0) or 0)

    ts_denom = 2 * (fga + 0.44 * fta)

    return {
        "season":  row.get("SEASON_ID"),
        "team":    row.get("TEAM_ABBREVIATION"),
        "age":     row.get("PLAYER_AGE"),
        "gp":      int(gp),
        "min_pg":  round(min_ / gp, 1) if gp else 0.0,
        "ppg":     round(pts / gp, 1) if gp else 0.0,
        "rpg":     round(reb / gp, 1) if gp else 0.0,
        "apg":     round(ast / gp, 1) if gp else 0.0,
        "spg":     round(stl / gp, 1) if gp else 0.0,
        "bpg":     round(blk / gp, 1) if gp else 0.0,
        "topg":    round(tov / gp, 1) if gp else 0.0,
        "fg_pct":  round(fgm / fga, 3) if fga else 0.0,
        "fg3_pct": round(fg3m / fg3a, 3) if fg3a else 0.0,
        "ft_pct":  round(ftm / fta, 3) if fta else 0.0,
        "ts_pct":  round(pts / ts_denom, 3) if ts_denom else 0.0,
        "efg_pct": round((fgm + 0.5 * fg3m) / fga, 3) if fga else 0.0,
    }


def get_player_profile(player_id: int) -> dict[str, Any]:
    career = _retry(
        lambda: playercareerstats.PlayerCareerStats(player_id=player_id, timeout=60)
    )
    info = _retry(lambda: commonplayerinfo.CommonPlayerInfo(player_id=player_id, timeout=60))

    career_dict = career.get_dict()
    info_dict = info.get_dict()

    seasons = []
    career_totals_row = None
    result_sets = career_dict.get("resultSets") or []
    for rs in result_sets:
        if rs.get("name") == "SeasonTotalsRegularSeason":
            headers = rs.get("headers") or []
            rows = rs.get("rowSet") or []
            for row in rows:
                seasons.append(dict(zip(headers, row, strict=False)))
        elif rs.get("name") == "CareerTotalsRegularSeason":
            headers = rs.get("headers") or []
            rows = rs.get("rowSet") or []
            if rows:
                career_totals_row = dict(zip(headers, rows[0], strict=False))

    player_row = None
    for rs in info_dict.get("resultSets") or []:
        if rs.get("name") == "CommonPlayerInfo" and rs.get("rowSet"):
            headers = rs.get("headers") or []
            player_row = dict(zip(headers, rs["rowSet"][0], strict=False))
            break

    season_stats = [_per_game_row(s) for s in seasons]
    career_stats = _per_game_row(career_totals_row) if career_totals_row else None

    return {
        "player_id": player_id,
        "info": player_row,
        "career_totals": career_stats,
        "seasons": season_stats,
    }
