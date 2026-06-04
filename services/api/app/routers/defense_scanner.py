"""Defense Scanner — identify which shot zones opponents exploit against a team."""

import time
from fastapi import APIRouter, HTTPException
from nba_api.stats.endpoints import leaguedashteamstats
from nba_api.stats.static import teams as static_teams

router = APIRouter(prefix="/defense", tags=["defense"])
SEASON = "2024-25"

# League average opponent FG% by zone (2024-25 approximations)
LEAGUE_AVG = {
    "Restricted Area": 0.64,
    "In The Paint (Non-RA)": 0.41,
    "Mid-Range": 0.42,
    "Left Corner 3": 0.37,
    "Right Corner 3": 0.37,
    "Above the Break 3": 0.36,
}

ZONE_LABELS = {
    "OPP_FG_PCT": "Overall",
    "OPP_FG3_PCT": "3-Point",
    "OPP_FG2_PCT": "2-Point",
    "OPP_PTS_PAINT": "Paint Points",
    "OPP_PTS_2ND_CHANCE": "2nd Chance",
    "OPP_PTS_FB": "Fast Break",
}


def _sleep():
    time.sleep(0.7)


@router.get("/team/{team_id}/vulnerabilities")
def defense_vulnerabilities(team_id: int):
    _sleep()
    try:
        opp = leaguedashteamstats.LeagueDashTeamStats(
            season=SEASON,
            measure_type_detailed_defense="Opponent",
            per_mode_detailed="PerGame",
            timeout=60,
        ).get_data_frames()[0]
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"NBA API error: {e}")

    if opp.empty:
        raise HTTPException(status_code=404, detail="No defensive data available.")

    # Get league averages for each metric
    league_avgs = opp.mean(numeric_only=True)

    team_row = opp[opp["TEAM_ID"] == team_id]
    if team_row.empty:
        raise HTTPException(status_code=404, detail="Team not found in defensive stats.")

    row = team_row.iloc[0]

    metrics = [
        ("OPP_FG_PCT", "Opponent FG%", True),
        ("OPP_FG3_PCT", "Opponent 3P%", True),
        ("OPP_FG2_PCT", "Opponent 2P%", True),
        ("OPP_PTS_PAINT", "Paint Points Allowed", True),
        ("OPP_PTS_2ND_CHANCE", "2nd Chance Points", True),
        ("OPP_PTS_FB", "Fast Break Points", True),
        ("OPP_AST", "Opponent Assists", True),
        ("OPP_TOV", "Forced Turnovers", False),
        ("OPP_REB", "Opponent Rebounds", True),
        ("OPP_PTS", "Opponent Points Per Game", True),
    ]

    vulnerabilities = []
    strengths = []

    for col, label, higher_is_worse in metrics:
        if col not in row.index:
            continue
        val = float(row[col])
        avg = float(league_avgs.get(col, val))
        if avg == 0:
            continue
        pct_diff = (val - avg) / avg * 100

        item = {
            "metric": label,
            "value": round(val, 3),
            "league_avg": round(avg, 3),
            "pct_above_avg": round(pct_diff, 1),
        }

        if higher_is_worse:
            if pct_diff > 5:
                item["severity"] = "Critical" if pct_diff > 12 else "Exploitable"
                vulnerabilities.append(item)
            elif pct_diff < -5:
                item["advantage"] = "Strong" if pct_diff < -12 else "Good"
                strengths.append(item)
        else:
            if pct_diff < -5:
                item["advantage"] = "Strong" if pct_diff < -12 else "Good"
                strengths.append(item)

    vulnerabilities.sort(key=lambda x: -x["pct_above_avg"])
    strengths.sort(key=lambda x: x["pct_above_avg"])

    # Overall defensive rank
    opp_sorted = opp.sort_values("OPP_PTS")
    def_rank = int(opp_sorted[opp_sorted["TEAM_ID"] == team_id].index[0] - opp_sorted.index[0] + 1)

    team_name = next(
        (t["full_name"] for t in static_teams.get_teams() if t["id"] == team_id),
        f"Team #{team_id}",
    )

    # Build game plan tip
    game_plan = []
    for v in vulnerabilities[:3]:
        game_plan.append(f"Attack their {v['metric'].lower()} ({v['pct_above_avg']:+.1f}% above league avg)")

    return {
        "team_id": team_id,
        "team_name": team_name,
        "season": SEASON,
        "defensive_rank": def_rank,
        "opp_pts_per_game": round(float(row.get("OPP_PTS", 0)), 1),
        "vulnerabilities": vulnerabilities,
        "strengths": strengths,
        "game_plan_tips": game_plan,
    }


@router.get("/teams")
def all_teams():
    teams = sorted(static_teams.get_teams(), key=lambda t: t["full_name"])
    return [{"id": t["id"], "name": t["full_name"], "abbreviation": t["abbreviation"]} for t in teams]
