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


def get_player_profile(player_id: int) -> dict[str, Any]:
    career = _retry(
        lambda: playercareerstats.PlayerCareerStats(player_id=player_id, timeout=60)
    )
    info = _retry(lambda: commonplayerinfo.CommonPlayerInfo(player_id=player_id, timeout=60))

    career_dict = career.get_dict()
    info_dict = info.get_dict()

    seasons = []
    result_sets = career_dict.get("resultSets") or []
    for rs in result_sets:
        if rs.get("name") == "SeasonTotalsRegularSeason":
            headers = rs.get("headers") or []
            rows = rs.get("rowSet") or []
            for row in rows[-3:]:
                seasons.append(dict(zip(headers, row, strict=False)))

    player_row = None
    for rs in info_dict.get("resultSets") or []:
        if rs.get("name") == "CommonPlayerInfo" and rs.get("rowSet"):
            headers = rs.get("headers") or []
            player_row = dict(zip(headers, rs["rowSet"][0], strict=False))
            break

    return {
        "player_id": player_id,
        "info": player_row,
        "recent_seasons": seasons,
    }
