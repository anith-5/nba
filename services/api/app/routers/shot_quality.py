"""Shot Quality — xFG% per player using ShotChartDetail + zone-based model."""

import time
from fastapi import APIRouter, HTTPException

from nba_api.stats.endpoints import shotchartdetail
from nba_api.stats.static import players as static_players

router = APIRouter(prefix="/shot-quality", tags=["shot-quality"])
SEASON = "2024-25"

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
