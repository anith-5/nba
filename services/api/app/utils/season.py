"""Single source of truth for "what NBA season is it right now".

NBA seasons run October through June, but the label stays the same
through the following offseason (July-September) since no new season has
started yet. So:
  - October, November, December -> season starting THIS year.
  - January through September   -> season that started LAST year.

Every current-season data pull across services/api and
services/arena-realtime (current rosters, current player stats,
current_nba_players.json, Wordle's current pool, Hint Auction's Current
era, standings, defense scanner, lineup optimizer, etc.) should derive its
season from this module rather than hardcoding a literal season string --
otherwise it silently goes stale the moment a new season actually starts.

Does NOT apply to All-Time/historical modes (Closest To's All-Time mode,
Hint Auction's All-Time mode) -- those intentionally pull a fixed
historical range, not "the current season".
"""

from __future__ import annotations

from datetime import date

SEASON_ROLLOVER_MONTH = 10  # October


def get_current_nba_season_start_year(today: date | None = None) -> int:
    """The year a season would have started in, given today's date -- e.g.
    2026 for any date from Oct 1, 2026 through Sep 30, 2027.
    """
    today = today or date.today()
    return today.year if today.month >= SEASON_ROLLOVER_MONTH else today.year - 1


def get_current_nba_season(today: date | None = None) -> str:
    """The current NBA season as "YYYY-YY", e.g. "2026-27" for any date
    from November 2026 through September 2027 (and October 2026 itself,
    the rollover month).
    """
    start_year = get_current_nba_season_start_year(today)
    return f"{start_year}-{str(start_year + 1)[-2:]}"


def season_string_for_start_year(start_year: int) -> str:
    """Formats an arbitrary start year as a season string -- e.g. 2024 ->
    "2024-25". Useful for computing seasons relative to the current one
    (the season before/after) without hardcoding any literal.
    """
    return f"{start_year}-{str(start_year + 1)[-2:]}"
