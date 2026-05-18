"""Reliable scoreboard fetching — direct HTTP, not nba_api live ScoreBoard."""

from __future__ import annotations

import json
import logging
from datetime import date, timedelta
from typing import Any

import requests
from nba_api.stats.endpoints import scoreboardv3

logger = logging.getLogger(__name__)

SCOREBOARD_CDN = (
    "https://cdn.nba.com/static/json/liveData/scoreboard/todaysScoreboard_00.json"
)

NBA_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.nba.com/",
    "Origin": "https://www.nba.com",
}


def _get_json(url: str, headers: dict[str, str] | None = None) -> dict[str, Any]:
    headers = {**NBA_HEADERS, **(headers or {})}
    if "cdn.nba.com" in url:
        headers["Host"] = "cdn.nba.com"

    resp = requests.get(url, headers=headers, timeout=45)
    resp.raise_for_status()
    text = (resp.text or "").strip()
    if not text:
        raise ValueError(f"Empty body from {url}")
    return json.loads(text)


def _from_stats_api(game_date: str) -> dict[str, Any]:
    board = scoreboardv3.ScoreboardV3(game_date=game_date, timeout=60)
    return board.get_dict()


def get_scoreboard() -> tuple[dict[str, Any], str]:
    """
    Try CDN first, then stats API for today and yesterday (timezone edge cases).
    Returns (payload, source).
  """
    errors: list[str] = []

    try:
        return _get_json(SCOREBOARD_CDN), "cdn"
    except Exception as exc:
        errors.append(f"cdn: {exc}")
        logger.warning("CDN scoreboard failed: %s", exc)

    today = date.today()
    for offset in (0, 1):
        day = (today - timedelta(days=offset)).isoformat()
        try:
            data = _from_stats_api(day)
            if data.get("scoreboard") is not None:
                return data, f"stats_v3:{day}"
        except Exception as exc:
            errors.append(f"stats {day}: {exc}")
            logger.warning("Stats scoreboard %s failed: %s", day, exc)

    raise RuntimeError("; ".join(errors))
