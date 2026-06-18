from app.config import settings
"""Clutch DNA Scorer  " compares clutch vs regular stats, outputs 0-100 score."""

import time
from typing import Optional
from fastapi import APIRouter, HTTPException
from nba_api.stats.endpoints import leaguedashplayerclutch, leaguedashplayerstats
from nba_api.stats.static import players as static_players

router = APIRouter(prefix="/clutch", tags=["clutch"])
SEASON = settings.current_season
MIN_CLUTCH_MINUTES = 1.0

_leaderboard_cache: Optional[dict] = None
_cache_ts: float = 0.0
CACHE_TTL = 3600.0


def _sleep():
    time.sleep(0.7)


def _norm(val: float, lo: float, hi: float) -> float:
    if hi == lo:
        return 0.5
    return max(0.0, min(1.0, (val - lo) / (hi - lo)))


def _clutch_score(
    pts_delta: float, fg_delta: float, ts_delta: float,
    ast_delta: float, tov_delta: float,
    all_deltas: dict[str, list[float]],
) -> float:
    score = (
        0.35 * _norm(pts_delta, min(all_deltas["pts"]), max(all_deltas["pts"]))
        + 0.25 * _norm(fg_delta,  min(all_deltas["fg"]),  max(all_deltas["fg"]))
        + 0.20 * _norm(ts_delta,  min(all_deltas["ts"]),  max(all_deltas["ts"]))
        + 0.10 * _norm(ast_delta, min(all_deltas["ast"]), max(all_deltas["ast"]))
        + 0.10 * _norm(-tov_delta, min([-t for t in all_deltas["tov"]]), max([-t for t in all_deltas["tov"]]))
    )
    return round(score * 100, 1)


def _fetch_leaderboard() -> dict:
    _sleep()
    clutch_df = leaguedashplayerclutch.LeagueDashPlayerClutch(
        season=SEASON,
        season_type_all_star="Regular Season",
        per_mode_detailed="PerGame",
        clutch_time="Last 5 Minutes",
        point_diff=5,
        timeout=120,
    ).get_data_frames()[0]

    _sleep()
    reg_df = leaguedashplayerstats.LeagueDashPlayerStats(
        season=SEASON,
        season_type_all_star="Regular Season",
        per_mode_detailed="PerGame",
        timeout=60,
    ).get_data_frames()[0]

    if clutch_df.empty or reg_df.empty:
        return {"players": []}

    # Filter minimum clutch minutes
    clutch_df = clutch_df[clutch_df["MIN"] >= MIN_CLUTCH_MINUTES].copy()

    reg_df = reg_df.set_index("PLAYER_ID")
    clutch_df = clutch_df[clutch_df["PLAYER_ID"].isin(reg_df.index)].copy()

    deltas: dict[str, list[float]] = {"pts": [], "fg": [], "ts": [], "ast": [], "tov": []}
    rows = []

    for _, cr in clutch_df.iterrows():
        pid = int(cr["PLAYER_ID"])
        if pid not in reg_df.index:
            continue
        rr = reg_df.loc[pid]

        pts_d = float(cr["PTS"]) - float(rr["PTS"])
        fg_d  = float(cr["FG_PCT"]) - float(rr["FG_PCT"])
        tov_d = float(cr["TOV"]) - float(rr["TOV"])
        ast_d = float(cr["AST"]) - float(rr["AST"])

        cr_pts = float(cr.get("PTS", 0))
        cr_fga = float(cr.get("FGA", 1))
        cr_fta = float(cr.get("FTA", 0))
        cr_fgm = float(cr.get("FGM", 0))
        cr_fg3m = float(cr.get("FG3M", 0))
        denom = cr_fga + 0.44 * cr_fta
        clutch_ts = (cr_pts / (2 * denom)) if denom > 0 else 0.0

        rr_pts = float(rr.get("PTS", 0))
        rr_fga = float(rr.get("FGA", 1))
        rr_fta = float(rr.get("FTA", 0))
        denom2 = rr_fga + 0.44 * rr_fta
        reg_ts = (rr_pts / (2 * denom2)) if denom2 > 0 else 0.0
        ts_d = clutch_ts - reg_ts

        deltas["pts"].append(pts_d)
        deltas["fg"].append(fg_d)
        deltas["ts"].append(ts_d)
        deltas["ast"].append(ast_d)
        deltas["tov"].append(tov_d)

        rows.append({
            "player_id": pid,
            "player_name": str(cr.get("PLAYER_NAME", "")),
            "clutch_pts": round(float(cr["PTS"]), 1),
            "reg_pts": round(float(rr["PTS"]), 1),
            "clutch_fg_pct": round(float(cr["FG_PCT"]), 3),
            "reg_fg_pct": round(float(rr["FG_PCT"]), 3),
            "clutch_minutes": round(float(cr["MIN"]), 1),
            "_deltas": (pts_d, fg_d, ts_d, ast_d, tov_d),
        })

    # Ensure at least 2 distinct values per delta list
    for k in deltas:
        if len(set(deltas[k])) < 2:
            deltas[k] = [min(deltas[k]) - 0.01] + deltas[k] + [max(deltas[k]) + 0.01]

    results = []
    for r in rows:
        pts_d, fg_d, ts_d, ast_d, tov_d = r.pop("_deltas")
        score = _clutch_score(pts_d, fg_d, ts_d, ast_d, tov_d, deltas)
        tier = "Elite" if score >= 75 else "Good" if score >= 55 else "Average" if score >= 40 else "Below Avg"
        results.append({**r, "clutch_score": score, "tier": tier, "pts_delta": round(pts_d, 1)})

    results.sort(key=lambda x: -x["clutch_score"])
    return {"players": results, "season": SEASON, "min_clutch_minutes": MIN_CLUTCH_MINUTES}


@router.get("/leaderboard")
def clutch_leaderboard(limit: int = 25):
    import time as _time
    global _leaderboard_cache, _cache_ts
    if _leaderboard_cache and (_time.time() - _cache_ts) < CACHE_TTL:
        data = _leaderboard_cache.copy()
        data["players"] = data["players"][:limit]
        return data

    data = _fetch_leaderboard()
    _leaderboard_cache = data
    _cache_ts = _time.time()
    data = data.copy()
    data["players"] = data["players"][:limit]
    return data


@router.get("/player/{player_id}")
def player_clutch(player_id: int):
    data = clutch_leaderboard(limit=10000)
    player = next((p for p in data["players"] if p["player_id"] == player_id), None)

    if not player:
        # Player not in clutch data  " fetch individually
        _sleep()
        try:
            clutch_df = leaguedashplayerclutch.LeagueDashPlayerClutch(
                season=SEASON,
                season_type_all_star="Regular Season",
                per_mode_detailed="PerGame",
                clutch_time="Last 5 Minutes",
                point_diff=5,
                timeout=120,
            ).get_data_frames()[0]
            row = clutch_df[clutch_df["PLAYER_ID"] == player_id]
            if row.empty:
                raise HTTPException(status_code=404, detail="Player has no clutch appearances this season.")
            minutes = float(row.iloc[0]["MIN"])
            return {
                "player_id": player_id,
                "clutch_score": None,
                "note": f"Insufficient clutch sample (< {MIN_CLUTCH_MINUTES} min). Has {minutes:.1f} clutch minutes.",
                "insufficient_sample": True,
            }
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=502, detail=str(e))

    return player


