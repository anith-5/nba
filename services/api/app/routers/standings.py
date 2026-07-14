"""Standings + home-page leaders. Cache-first (works on the cloud where NBA
blocks the IP); live locally. Pre-computed by precompute.py."""

from fastapi import APIRouter
from nba_api.stats.endpoints import leaguestandingsv3, leaguedashplayerstats
from nba_api.stats.static import teams as static_teams

from app.config import settings
from app import data_cache

router = APIRouter(prefix="/standings", tags=["standings"])
SEASON = settings.current_season
STANDINGS_CACHE = "standings.json"
SCORING_CACHE = "scoring_leaders.json"

_TEAM_TRI = {t["id"]: t["abbreviation"] for t in static_teams.get_teams()}


def _fetch_standings_live() -> dict:
    df = leaguestandingsv3.LeagueStandingsV3(season=SEASON, timeout=60).get_data_frames()[0]
    out = {"East": [], "West": []}
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


def _fetch_scoring_live() -> list:
    df = leaguedashplayerstats.LeagueDashPlayerStats(
        season=SEASON, per_mode_detailed="PerGame", timeout=60,
    ).get_data_frames()[0]
    top = df.sort_values("PTS", ascending=False).head(5)
    return [
        {"name": str(r["PLAYER_NAME"]), "tri": str(r["TEAM_ABBREVIATION"]),
         "ppg": round(float(r["PTS"]), 1)}
        for _, r in top.iterrows()
    ]


def _standings() -> dict:
    return data_cache.cached_or_live(STANDINGS_CACHE, _fetch_standings_live, kind="json")


def _scoring() -> list:
    return data_cache.cached_or_live(SCORING_CACHE, _fetch_scoring_live, kind="json")


@router.get("")
def get_standings():
    result = {"season": SEASON}

    try:
        result["standings"] = _standings()
    except Exception:
        result["standings"] = {"East": [], "West": []}

    try:
        result["scoring_leaders"] = _scoring()
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
