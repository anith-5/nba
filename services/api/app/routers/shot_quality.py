"""Shot Quality — xFG% per player using ShotChartDetail + zone-based model.
   Also includes Shot Evaluator: grade a shot given defender + zone + distance.
"""

import asyncio
import time
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from nba_api.stats.endpoints import shotchartdetail, leaguedashplayerstats
from nba_api.stats.static import players as static_players

from app.config import settings

router = APIRouter(prefix="/shot-quality", tags=["shot-quality"])
SEASON = settings.current_season

# League average FG% by zone (2024-25 approximations)
ZONE_XFG = {
    "Restricted Area": 0.68,
    "In The Paint (Non-RA)": 0.40,
    "Mid-Range": 0.43,
    "Left Corner 3": 0.38,
    "Right Corner 3": 0.38,
    "Above the Break 3": 0.36,
    "Backcourt": 0.15,
}

GRADE_THRESHOLDS = [
    (0.62, "A+"), (0.56, "A"), (0.51, "B+"), (0.46, "B"),
    (0.42, "C+"), (0.38, "C"), (0.33, "D"),
]


def _grade(player_fg: float, xfg: float) -> str:
    delta = player_fg - xfg
    if delta > 0.10: return "A+"
    if delta > 0.05: return "A"
    if delta > 0.02: return "B+"
    if delta > -0.02: return "B"
    if delta > -0.05: return "C"
    if delta > -0.10: return "D"
    return "F"


@router.get("/player/{player_id}")
def player_shot_quality(player_id: int):
    time.sleep(0.7)
    try:
        chart = shotchartdetail.ShotChartDetail(
            player_id=player_id,
            team_id=0,
            game_id_nullable="",
            season_nullable=SEASON,
            season_type_all_star="Regular Season",
            context_measure_simple="FGA",
            timeout=120,
        )
        shots_df = chart.get_data_frames()[0]
        league_df = chart.get_data_frames()[1]
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"NBA API error: {e}")

    if shots_df.empty:
        raise HTTPException(status_code=404, detail="No shot data found for this player this season.")

    # Build per-zone breakdown
    zone_col = "SHOT_ZONE_BASIC"
    made_col = "SHOT_MADE_FLAG"

    zones = {}
    for zone, group in shots_df.groupby(zone_col):
        attempts = len(group)
        made = int(group[made_col].sum())
        fg_pct = round(made / attempts, 3) if attempts else 0.0
        xfg = ZONE_XFG.get(zone, 0.43)
        zones[zone] = {
            "zone": zone,
            "attempts": attempts,
            "made": made,
            "fg_pct": fg_pct,
            "xfg_pct": xfg,
            "delta": round(fg_pct - xfg, 3),
            "grade": _grade(fg_pct, xfg),
        }

    total_att = int(shots_df[made_col].count())
    total_made = int(shots_df[made_col].sum())
    overall_fg = round(total_made / total_att, 3) if total_att else 0.0

    # Weighted xFG% by shot volume
    weighted_xfg = sum(
        (v["attempts"] / total_att) * v["xfg_pct"]
        for v in zones.values()
    ) if total_att else 0.0

    overall_grade = _grade(overall_fg, weighted_xfg)

    # Player name from static
    pname = next(
        (p["full_name"] for p in static_players.get_players() if p["id"] == player_id),
        f"Player #{player_id}",
    )

    return {
        "player_id": player_id,
        "player_name": pname,
        "season": SEASON,
        "overall_fg_pct": overall_fg,
        "overall_xfg_pct": round(weighted_xfg, 3),
        "overall_grade": overall_grade,
        "total_attempts": total_att,
        "shot_zones": sorted(zones.values(), key=lambda z: -z["attempts"]),
    }


# ─────────────────────────────────────────────────────────────────────────────
# Shot Evaluator  — grade a specific shot given shooter, defender, zone, distance
# ─────────────────────────────────────────────────────────────────────────────

ZONE_IS_THREE = {"Left Corner 3", "Right Corner 3", "Above the Break 3"}

# How much defender distance shifts expected FG%
DISTANCE_ADJ = {
    "tight":     -0.095,   # 0-2 ft — heavily contested
    "close":     -0.050,   # 2-4 ft — contested
    "open":       0.000,   # 4-6 ft — clean look
    "wide_open":  0.065,   # 6+ ft  — uncontested
}

LEAGUE_AVG_FG   = 0.455   # overall FG%
LEAGUE_AVG_3P   = 0.360   # 3P%
LEAGUE_AVG_DRTG = 113.0   # defensive rating


class ShotEvalRequest(BaseModel):
    shooter_id: str
    defender_id: str
    zone: str
    defender_distance: str   # "tight" | "close" | "open" | "wide_open"


def _player_name(player_id: str) -> str:
    return next(
        (p["full_name"] for p in static_players.get_players()
         if str(p["id"]) == str(player_id)),
        f"Player #{player_id}",
    )


def _fetch_base_stats(player_id: str) -> dict | None:
    """FG%, 3P%, PPG for a player via LeagueDashPlayerStats."""
    df = leaguedashplayerstats.LeagueDashPlayerStats(
        per_mode_detailed="PerGame",
        measure_type_detailed_defense="Base",
        season=SEASON,
        timeout=30,
    ).get_data_frames()[0]
    row = df[df["PLAYER_ID"].astype(str) == str(player_id)]
    if row.empty:
        return None
    r = row.iloc[0]
    return {
        "fg_pct":  float(r["FG_PCT"]  or LEAGUE_AVG_FG),
        "fg3_pct": float(r["FG3_PCT"] or LEAGUE_AVG_3P),
        "pts":     float(r["PTS"]     or 0.0),
        "fga":     float(r["FGA"]     or 0.0),
        "fg3a":    float(r["FG3A"]    or 0.0),
    }


def _fetch_advanced_stats(player_id: str) -> dict | None:
    """DEF_RATING, BLK_PCT, STL_PCT for a player."""
    df = leaguedashplayerstats.LeagueDashPlayerStats(
        per_mode_detailed="PerGame",
        measure_type_detailed_defense="Advanced",
        season=SEASON,
        timeout=30,
    ).get_data_frames()[0]
    row = df[df["PLAYER_ID"].astype(str) == str(player_id)]
    if row.empty:
        return None
    r = row.iloc[0]
    return {
        "drtg":     float(r.get("DEF_RATING", LEAGUE_AVG_DRTG) or LEAGUE_AVG_DRTG),
        "blk_pct":  float(r.get("BLK_PCT",  0.020) or 0.020),
        "stl_pct":  float(r.get("STL_PCT",  0.015) or 0.015),
        "dreb_pct": float(r.get("DREB_PCT", 0.150) or 0.150),
    }


def _ppp_grade(ppp: float) -> str:
    if ppp >= 1.40: return "A+"
    if ppp >= 1.25: return "A"
    if ppp >= 1.15: return "A-"
    if ppp >= 1.08: return "B+"
    if ppp >= 1.00: return "B"
    if ppp >= 0.93: return "B-"
    if ppp >= 0.87: return "C+"
    if ppp >= 0.82: return "C"
    if ppp >= 0.76: return "C-"
    if ppp >= 0.70: return "D+"
    if ppp >= 0.65: return "D"
    return "F"


@router.post("/evaluate-shot")
async def evaluate_shot(body: ShotEvalRequest):
    # Fetch shooter base + defender advanced in parallel
    shooter_stats, def_stats = await asyncio.gather(
        asyncio.to_thread(_fetch_base_stats, body.shooter_id),
        asyncio.to_thread(_fetch_advanced_stats, body.defender_id),
    )

    if not shooter_stats:
        raise HTTPException(400, "Could not find shooter stats for this season.")
    if not def_stats:
        raise HTTPException(400, "Could not find defender stats for this season.")

    zone = body.zone
    is_three = zone in ZONE_IS_THREE
    zone_xfg = ZONE_XFG.get(zone, 0.43)

    # ── 1. Shooter zone FG% estimate ────────────────────────────────────────
    if is_three:
        # Scale zone league-avg by how the shooter performs vs league avg 3P%
        shooter_zone_fg = zone_xfg * (shooter_stats["fg3_pct"] / LEAGUE_AVG_3P)
    else:
        # Estimate 2-pt FG% from overall FG%
        fga = max(shooter_stats["fga"], 1)
        three_share = shooter_stats["fg3a"] / fga
        est_2fg = (shooter_stats["fg_pct"] - three_share * shooter_stats["fg3_pct"]) / max(
            1 - three_share, 0.40
        )
        est_2fg = max(0.30, min(0.78, est_2fg))
        league_2fg = 0.52   # approximate NBA 2P FG%
        shooter_zone_fg = zone_xfg * (est_2fg / league_2fg)

    shooter_zone_fg = max(0.18, min(0.88, shooter_zone_fg))

    # ── 2. Defender difficulty ───────────────────────────────────────────────
    drtg_delta = LEAGUE_AVG_DRTG - def_stats["drtg"]       # positive = good defender
    def_adj = -(drtg_delta / 3.0) * 0.010                  # each 3 DRTG pts ≈ 1% FG%
    if not is_three:
        def_adj -= def_stats["blk_pct"] * 0.45             # rim protection penalty

    # ── 3. Distance modifier ────────────────────────────────────────────────
    dist_adj = DISTANCE_ADJ.get(body.defender_distance, 0.0)

    # ── 4. Final FG% estimate + PPP ─────────────────────────────────────────
    final_fg = max(0.12, min(0.85, shooter_zone_fg + def_adj + dist_adj))
    ppp = round(final_fg * (3 if is_three else 2), 3)
    grade = _ppp_grade(ppp)
    verdict = "Good Shot" if ppp >= 1.00 else "Bad Shot"

    # ── 5. Factor analysis ───────────────────────────────────────────────────
    factors = []

    # Shooter efficiency in this zone
    if is_three:
        pct = shooter_stats["fg3_pct"]
        if pct >= 0.390:
            factors.append({"icon": "+", "text": f"Elite 3-pt shooter ({pct:.1%} 3P%) — dangerous from deep"})
        elif pct >= 0.360:
            factors.append({"icon": "~", "text": f"Average 3-pt shooter ({pct:.1%} 3P%)"})
        else:
            factors.append({"icon": "-", "text": f"Below-average 3-pt shooter ({pct:.1%} 3P%)"})
    else:
        fg = shooter_stats["fg_pct"]
        pts = shooter_stats["pts"]
        if fg >= 0.520:
            factors.append({"icon": "+", "text": f"High-efficiency scorer ({fg:.1%} FG%, {pts:.1f} PPG)"})
        elif fg >= 0.450:
            factors.append({"icon": "~", "text": f"Average efficiency ({fg:.1%} FG%, {pts:.1f} PPG)"})
        else:
            factors.append({"icon": "-", "text": f"Low-efficiency scorer ({fg:.1%} FG%, {pts:.1f} PPG)"})

    # Defender quality
    drtg = def_stats["drtg"]
    defender_name = _player_name(body.defender_id)
    if drtg <= 108:
        factors.append({"icon": "-", "text": f"{defender_name} is elite defensively (DRTG {drtg:.0f}) — major challenge"})
    elif drtg <= 111:
        factors.append({"icon": "-", "text": f"{defender_name} is a good defender (DRTG {drtg:.0f})"})
    elif drtg <= 115:
        factors.append({"icon": "~", "text": f"{defender_name} is an average defender (DRTG {drtg:.0f})"})
    else:
        factors.append({"icon": "+", "text": f"{defender_name} struggles defensively (DRTG {drtg:.0f}) — exploitable"})

    if not is_three and def_stats["blk_pct"] >= 0.040:
        factors.append({"icon": "-", "text": f"{defender_name} blocks {def_stats['blk_pct']:.1%} of interior attempts"})

    # Distance
    dist_labels = {
        "tight":     ("−", "Tightly contested (0-2 ft) — major difficulty modifier"),
        "close":     ("−", "Closely guarded (2-4 ft) — contested shot"),
        "open":      ("~", "Open look (4-6 ft) — neutral contest"),
        "wide_open": ("+", "Wide open (6+ ft) — uncontested, easiest look"),
    }
    icon, text = dist_labels.get(body.defender_distance, ("~", ""))
    factors.append({"icon": icon, "text": text})

    # Zone context
    zone_notes = {
        "Restricted Area":       "Restricted area is the highest-% zone on the floor",
        "In The Paint (Non-RA)": "Paint shots outside RA are below average efficiency",
        "Mid-Range":             "Mid-range is the least efficient shot in modern NBA",
        "Left Corner 3":         "Corner 3s are the most efficient 3-pt shot",
        "Right Corner 3":        "Corner 3s are the most efficient 3-pt shot",
        "Above the Break 3":     "Above-the-break 3s are high value if the shooter is capable",
    }
    factors.append({"icon": "i", "text": zone_notes.get(zone, zone)})

    shooter_name = _player_name(body.shooter_id)

    return {
        "grade":             grade,
        "verdict":           verdict,
        "ppp":               ppp,
        "shooter_name":      shooter_name,
        "defender_name":     defender_name,
        "zone":              zone,
        "defender_distance": body.defender_distance,
        "zone_league_avg_fg": zone_xfg,
        "shooter_zone_fg_est": round(shooter_zone_fg, 3),
        "final_fg_est":      round(final_fg, 3),
        "defender_drtg":     drtg,
        "factors":           factors,
    }

