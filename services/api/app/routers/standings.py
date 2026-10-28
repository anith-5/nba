"""Standings + home-page leaders. Cache-first (works on the cloud where NBA
blocks the IP); live locally. Pre-computed by precompute.py."""

from fastapi import APIRouter
from nba_api.stats.endpoints import leaguestandingsv3, leaguedashplayerstats
from nba_api.stats.static import teams as static_teams

from app.config import settings
from app import data_cache
from app.utils.season import (
    get_current_nba_season_start_year,
    season_string_for_start_year,
)

router = APIRouter(prefix="/standings", tags=["standings"])
SEASON = settings.current_season

# CACHES ARE KEYED BY SEASON, AND THE LABEL COMES FROM THE DATA.
#
# This endpoint used to report `settings.current_season` while serving an
# unkeyed snapshot file. The two had no connection, so when the season rolled
# over on 1 October the API began announcing "2026-27" over last season's final
# 82-game records -- the home page showed Detroit 60-22 under this year's
# label. Stale data is a nuisance; stale data wearing a current label is a
# wrong answer.
#
# Both halves are fixed the same way: the file name carries the season, so a
# rollover misses rather than silently serving the wrong year, and the season
# reported to the caller is read back out of the payload actually served.


def standings_cache(season: str) -> str:
    return f"standings_{season}.json"


def scoring_cache(season: str) -> str:
    return f"scoring_leaders_{season}.json"

_TEAM_TRI = {t["id"]: t["abbreviation"] for t in static_teams.get_teams()}


def fetch_standings_live(season: str = None) -> dict:
    season = season or SEASON
    df = leaguestandingsv3.LeagueStandingsV3(season=season, timeout=60).get_data_frames()[0]
    out = {"season": season, "East": [], "West": []}
    for _, r in df.sort_values("PlayoffRank").iterrows():
        conf = str(r["Conference"])
        if conf not in out:
            continue
        out[conf].append({
            "tri": _TEAM_TRI.get(int(r["TeamID"]), ""),
            "name": str(r["TeamName"]),
            "w": int(r["WINS"]),
            "l": int(r["LOSSES"]),
        })
    return out


def fetch_scoring_live(season: str = None) -> list:
    season = season or SEASON
    df = leaguedashplayerstats.LeagueDashPlayerStats(
        season=season, per_mode_detailed="PerGame", timeout=60,
    ).get_data_frames()[0]
    top = df.sort_values("PTS", ascending=False).head(5)
    return [
        {"name": str(r["PLAYER_NAME"]), "tri": str(r["TEAM_ABBREVIATION"]),
         "ppg": round(float(r["PTS"]), 1)}
        for _, r in top.iterrows()
    ]


def _standings(season: str) -> dict:
    return data_cache.cached_or_live(
        standings_cache(season), lambda: fetch_standings_live(season), kind="json"
    )


def _scoring(season: str) -> list:
    return data_cache.cached_or_live(
        scoring_cache(season), lambda: fetch_scoring_live(season), kind="json"
    )


def _games_played(table: dict) -> int:
    """Most games any single team has played. 0 means the season has not started."""
    rows = [r for conf in ("East", "West") for r in (table or {}).get(conf) or []]
    return max((r.get("w", 0) + r.get("l", 0) for r in rows), default=0)


@router.get("")
def get_standings():
    # Resolve which season actually has data before labelling anything. A
    # season that has not tipped off yet exists in the API but with every team
    # at 0-0, which is worse than useless on a home page -- so fall back to the
    # one that just finished and say so, rather than showing an empty table or
    # (as before) last season's numbers under this season's name.
    season = SEASON
    table = None
    try:
        table = _standings(season)
    except Exception:
        table = None

    played = _games_played(table)
    is_prior = False
    if played == 0:
        prior = season_string_for_start_year(get_current_nba_season_start_year() - 1)
        try:
            prior_table = _standings(prior)
        except Exception:
            prior_table = None
        if _games_played(prior_table) > 0:
            season, table, is_prior = prior, prior_table, True
            played = _games_played(table)

    # The season reported is the season of the data that was actually served.
    result = {
        "season": (table or {}).get("season") or season,
        "is_prior_season": is_prior,
        "games_played": played,
        # 82 games means the regular season is done; anything less is in flight.
        "complete": played >= 82,
    }
    result["standings"] = table or {"East": [], "West": []}

    try:
        result["scoring_leaders"] = _scoring(season)
    except Exception:
        result["scoring_leaders"] = []

    # Clutch leaders — reuse the cached clutch leaderboard, but surface the top
    # clutch SCORERS among real rotation scorers (reg PPG >= 18). The raw
    # clutch-score leaders are dominated by tiny-sample role players, and the
    # clutch TIER measures elevation-vs-baseline (so a star can read "Below Avg"),
    # which is confusing on a leaderboard — show season PPG as context instead.
    try:
        from app.routers import clutch_dna
        all_players = clutch_dna._fetch_leaderboard().get("players") or []
        eligible = [p for p in all_players if float(p.get("reg_pts", 0)) >= 18] or all_players
        players = sorted(eligible, key=lambda p: -float(p.get("clutch_pts", 0)))[:5]
        result["clutch_leaders"] = [
            {"name": p["player_name"], "ppg": round(float(p.get("clutch_pts", 0)), 1),
             "reg_ppg": round(float(p.get("reg_pts", 0)), 1)}
            for p in players
        ]
    except Exception:
        result["clutch_leaders"] = []

    return result
