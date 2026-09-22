"""Team power rankings endpoint."""

from __future__ import annotations

from fastapi import APIRouter

from app import power_rankings
from app.security import internal_error

router = APIRouter(prefix="/power-rankings", tags=["power-rankings"])


@router.get("")
def get_power_rankings():
    """All 30 teams, strongest first, with the component breakdown.

    Takes no parameters: the season is resolved server-side (current if it has
    started, otherwise the one just finished) so a caller cannot ask for a
    season that has no games and get an empty table back.
    """
    try:
        return power_rankings.get_power_rankings()
    except Exception as exc:
        raise internal_error(exc, "Power rankings")
