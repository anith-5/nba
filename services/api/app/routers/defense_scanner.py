"""Defense Scanner - defensive rankings, vulnerabilities, and exploitation tactics."""

import time
from fastapi import APIRouter, HTTPException
from nba_api.stats.endpoints import leaguedashteamstats
from nba_api.stats.static import teams as static_teams

from app.config import settings
from app.claude_client import chat_completion, is_available
from app import data_cache

router = APIRouter(prefix="/defense", tags=["defense"])
SEASON = settings.current_season
HAIKU = "claude-haiku-4-5-20251001"
DEFENSE_CACHE = "defense_league.json"

# ---------------------------------------------------------------------------
# Tactical exploitation advice per vulnerability
# ---------------------------------------------------------------------------
EXPLOIT_TACTICS = {
    "Opponent FG%": {
        "tip": "Their defense breaks down under pressure - attack aggressively throughout.",
        "actions": [
            "Attack in transition before they can set their defense",
            "Draw fouls early to put key defenders in foul trouble",
            "Run isolation plays on mismatches created by screens",
        ],
    },
    "Opponent 3P%": {
        "tip": "Slow closeouts - shooters get clean looks off screens and kick-outs.",
        "actions": [
            "Run pin-down screens to free up corner shooters",
            "Use horns sets - the shooter catches and fires before the closeout arrives",
            "Drive and kick: collapse defense, then swing to the open corner 3",
        ],
    },
    "Opponent 2P%": {
        "tip": "Interior defense is weak - attack the paint and mid-range.",
        "actions": [
            "Drive hard off pick-and-roll - the big concedes the paint",
            "Post up mismatches; they allow high-% finishes inside",
            "Elbow jumpers and short mid-range shots are open",
        ],
    },
    "Paint Points Allowed": {
        "tip": "Their center drops too deep or their guards get beat off the dribble.",
        "actions": [
            "Run pick-and-roll relentlessly - roll man gets open looks at the rim",
            "Backdoor cuts when help defenders collapse on ball-handlers",
            "Post mismatches when a guard switches onto your big",
        ],
    },
    "2nd Chance Points": {
        "tip": "Weak rebounding team - send multiple players to the offensive glass.",
        "actions": [
            "Crash 3 players to the offensive glass on every shot attempt",
            "Use your center to seal inside rebounding position before the shot",
            "Quick offensive tip-ins - don't let the ball hit the floor",
        ],
    },
    "Fast Break Points": {
        "tip": "Slow transition defense - push the pace immediately after every stop.",
        "actions": [
            "Outlet the ball instantly after every defensive rebound",
            "Attack in numbers before they can sprint back",
            "Your fastest guard should always be ahead of the ball in transition",
        ],
    },
    "Opponent Assists": {
        "tip": "Their rotations are slow - ball movement creates open looks.",
        "actions": [
            "Run 4-out 1-in motion sets to expose rotation gaps",
            "Reverse the ball quickly - the weak-side shooter is often open",
            "Use dribble hand-offs to create defensive confusion",
        ],
    },
    "Opponent Points Per Game": {
        "tip": "High-scoring opponents against this team - stay aggressive all game.",
        "actions": [
            "Push offensive tempo to maximize possessions",
            "Attack early in the shot clock before they're set",
        ],
    },
}

STRENGTH_WARNINGS = {
    "Forced Turnovers": "Elite ball-hawking team - protect the ball, avoid skip passes, limit live-ball turnovers.",
    "Opponent 3P%": "Elite perimeter defense - don't force 3s, attack the mid-range and paint instead.",
    "Paint Points Allowed": "Strong interior defense - stretch them with shooting, avoid driving into traffic.",
    "Opponent FG%": "Disciplined defense - be patient, take only high-quality shots.",
    "Opponent Points Per Game": "Elite defensive team - expect a slow, grind-it-out game.",
    "Opponent 2P%": "Strong mid-range and paint defense - stretch to the 3-point line.",
}

METRICS = [
    ("OPP_FG_PCT",       "Opponent FG%",             True),
    ("OPP_FG3_PCT",      "Opponent 3P%",             True),
    ("OPP_FG2_PCT",      "Opponent 2P%",             True),
    ("OPP_PTS_PAINT",    "Paint Points Allowed",     True),
    ("OPP_PTS_2ND_CHANCE","2nd Chance Points",       True),
    ("OPP_PTS_FB",       "Fast Break Points",        True),
    ("OPP_AST",          "Opponent Assists",         True),
    ("OPP_TOV",          "Forced Turnovers",         False),
    ("OPP_REB",          "Opponent Rebounds",        True),
    ("OPP_PTS",          "Opponent Points Per Game", True),
]


def _sleep():
    time.sleep(0.7)


def _fetch_league_defense():
    """Local: live/fresh. Cloud: cached snapshot (NBA blocks cloud IPs)."""
    return data_cache.cached_or_live(DEFENSE_CACHE, _fetch_league_defense_live, kind="df")


def _fetch_league_defense_live():
    """Opponent per-game stats merged with Advanced stats (DEF_RATING, PACE).

    DEF_RATING (points allowed per 100 possessions) is the pace-adjusted
    measure of defensive quality and is used for ranking — OPP_PTS alone is
    biased by how fast a team plays.
    """
    _sleep()
    opp = leaguedashteamstats.LeagueDashTeamStats(
        season=SEASON,
        measure_type_detailed_defense="Opponent",
        per_mode_detailed="PerGame",
        timeout=60,
    ).get_data_frames()[0]
    if opp.empty:
        raise ValueError("No defensive data available for this season.")

    _sleep()
    adv = leaguedashteamstats.LeagueDashTeamStats(
        season=SEASON,
        measure_type_detailed_defense="Advanced",
        per_mode_detailed="PerGame",
        timeout=60,
    ).get_data_frames()[0]

    if not adv.empty:
        adv_cols = ["TEAM_ID", "DEF_RATING", "OFF_RATING", "PACE"]
        adv_cols = [c for c in adv_cols if c in adv.columns]
        opp = opp.merge(adv[adv_cols], on="TEAM_ID", how="left")

    return opp


def _rank_column(df) -> str:
    """Prefer DEF_RATING (pace-adjusted) for ranking; fall back to OPP_PTS."""
    return "DEF_RATING" if "DEF_RATING" in df.columns and df["DEF_RATING"].notna().any() else "OPP_PTS"


def _build_offensive_plan(metric_pct: dict, vulnerabilities: list, strengths: list,
                          def_rating, pace) -> dict:
    """Synthesize a structured offensive game plan from a team's actual
    defensive vulnerabilities. Rule-based — instant, deterministic, all 30 teams."""

    # ── Tempo ────────────────────────────────────────────────────────────────
    fb = metric_pct.get("Fast Break Points", 0)
    if fb > 5:
        tempo = (f"Push the pace — they allow {fb:.0f}% more fast-break points than "
                 f"average. Outlet immediately and attack before they set.")
    elif fb < -5:
        tempo = ("Play through the half court — they defend transition well. Value "
                 "each possession and don't force early offense.")
    else:
        tempo = "Pick your spots in transition, but expect to win games in the half court."

    # ── Primary / secondary attack ────────────────────────────────────────────
    primary = secondary = None
    if vulnerabilities:
        v0 = vulnerabilities[0]
        primary = {
            "target": v0["metric"],
            "why": v0.get("how_to_exploit", {}).get("tip", ""),
            "actions": v0.get("how_to_exploit", {}).get("actions", [])[:2],
        }
    if len(vulnerabilities) > 1:
        v1 = vulnerabilities[1]
        secondary = {
            "target": v1["metric"],
            "why": v1.get("how_to_exploit", {}).get("tip", ""),
            "actions": v1.get("how_to_exploit", {}).get("actions", [])[:2],
        }

    # ── Shot profile ───────────────────────────────────────────────────────────
    opp3 = metric_pct.get("Opponent 3P%", 0)
    opp2 = metric_pct.get("Opponent 2P%", 0)
    if opp2 > opp3 + 3:
        shot_profile = ("Hunt 2s — their interior/mid-range defense leaks more than their "
                        "perimeter. Drive, post, and take rhythm mid-range looks.")
    elif opp3 > opp2 + 3:
        shot_profile = ("Hunt 3s — their perimeter defense is leakier than their interior. "
                        "Space the floor and generate kick-out threes.")
    else:
        shot_profile = "Balanced shot diet — no strong positional hole in their FG defense."

    # ── What to avoid ────────────────────────────────────────────────────────
    if strengths:
        avoid = f"{strengths[0]['metric']}: {strengths[0].get('warning', '')}"
    else:
        avoid = "No elite strength to avoid — attack their league-average areas freely."

    plan = {
        "tempo": tempo,
        "primary_attack": primary,
        "secondary_attack": secondary,
        "shot_profile": shot_profile,
        "avoid": avoid,
    }
    return plan


def _build_team_profile(row, league_avgs, rank: int, team_name: str) -> dict:
    vulnerabilities, strengths = [], []
    metric_pct = {}

    for col, label, higher_is_worse in METRICS:
        if col not in row.index:
            continue
        val = float(row[col])
        avg = float(league_avgs.get(col, val))
        if avg == 0:
            continue
        pct_diff = (val - avg) / avg * 100
        metric_pct[label] = pct_diff

        item = {
            "metric": label,
            "value": round(val, 3),
            "league_avg": round(avg, 3),
            "pct_above_avg": round(pct_diff, 1),
        }

        if higher_is_worse:
            if pct_diff > 5:
                item["severity"] = "Critical" if pct_diff > 12 else "Exploitable"
                tactics = EXPLOIT_TACTICS.get(label, {})
                item["how_to_exploit"] = {
                    "tip": tactics.get("tip", ""),
                    "actions": tactics.get("actions", []),
                }
                vulnerabilities.append(item)
            elif pct_diff < -5:
                item["advantage"] = "Strong" if pct_diff < -12 else "Good"
                item["warning"] = STRENGTH_WARNINGS.get(label, "This is a defensive strength - avoid attacking here.")
                strengths.append(item)
        else:
            if pct_diff < -5:
                item["advantage"] = "Strong" if pct_diff < -12 else "Good"
                item["warning"] = STRENGTH_WARNINGS.get(label, "This is a defensive strength.")
                strengths.append(item)

    vulnerabilities.sort(key=lambda x: -x["pct_above_avg"])
    strengths.sort(key=lambda x: x["pct_above_avg"])

    game_plan = [
        f"{v['how_to_exploit']['tip']}" for v in vulnerabilities[:2] if "how_to_exploit" in v
    ]

    def_rating = round(float(row["DEF_RATING"]), 1) if "DEF_RATING" in row.index and row.get("DEF_RATING") == row.get("DEF_RATING") else None
    pace = round(float(row["PACE"]), 1) if "PACE" in row.index and row.get("PACE") == row.get("PACE") else None

    offensive_plan = _build_offensive_plan(metric_pct, vulnerabilities, strengths, def_rating, pace)

    return {
        "team_name": team_name,
        "defensive_rank": rank,
        "def_rating": def_rating,
        "pace": pace,
        "opp_pts_per_game": round(float(row.get("OPP_PTS", 0)), 1),
        "vulnerabilities": vulnerabilities,
        "strengths": strengths,
        "game_plan_tips": game_plan,
        "offensive_plan": offensive_plan,
    }


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/teams")
def all_teams():
    teams = sorted(static_teams.get_teams(), key=lambda t: t["full_name"])
    return [{"id": t["id"], "name": t["full_name"], "abbreviation": t["abbreviation"]} for t in teams]


def _claude_offensive_plan(profile: dict) -> str | None:
    """Richer Claude-written narrative game plan for the single-team deep dive."""
    if not is_available():
        return None

    vulns = ", ".join(
        f"{v['metric']} ({v['pct_above_avg']:+.0f}% vs avg)" for v in profile["vulnerabilities"][:4]
    ) or "none significant"
    strs = ", ".join(
        f"{s['metric']} ({s['pct_above_avg']:+.0f}% vs avg)" for s in profile["strengths"][:3]
    ) or "none significant"

    system = (
        "You are an NBA assistant coach writing a concise offensive game plan to "
        "attack a specific opponent's defense. Be tactical and specific. Structure as: "
        "a 2-sentence overview, then 3 bullet points of concrete play-calls/actions, then "
        "one 'Key to the game' sentence. Reference the data given. No filler."
    )
    rating_bits = []
    if profile.get("def_rating") is not None:
        rating_bits.append(f"DEF_RATING {profile['def_rating']}")
    if profile.get("pace") is not None:
        rating_bits.append(f"PACE {profile['pace']}")
    rating_str = f" ({', '.join(rating_bits)})" if rating_bits else ""

    user = (
        f"Opponent: {profile['team_name']}\n"
        f"Defensive rank: #{profile['defensive_rank']} of 30{rating_str}\n"
        f"Their defensive vulnerabilities: {vulns}\n"
        f"Their defensive strengths (avoid): {strs}\n\n"
        f"Write the offensive game plan to beat this defense."
    )
    try:
        text, _ = chat_completion(HAIKU, system, [{"role": "user", "content": user}], 500)
        return text
    except Exception:
        return None


@router.get("/team/{team_id}/vulnerabilities")
def defense_vulnerabilities(team_id: int):
    try:
        opp = _fetch_league_defense()
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))

    league_avgs = opp.mean(numeric_only=True)

    team_row = opp[opp["TEAM_ID"] == team_id]
    if team_row.empty:
        raise HTTPException(status_code=404, detail="Team not found.")

    # Rank by DEF_RATING ascending (pace-adjusted; lowest = best defense = rank 1)
    rank_col = _rank_column(opp)
    opp_sorted = opp.sort_values(rank_col).reset_index(drop=True)
    pos = opp_sorted[opp_sorted["TEAM_ID"] == team_id].index
    def_rank = int(pos[0]) + 1 if len(pos) > 0 else 30

    team_name = next(
        (t["full_name"] for t in static_teams.get_teams() if t["id"] == team_id),
        f"Team #{team_id}",
    )

    profile = _build_team_profile(team_row.iloc[0], league_avgs, def_rank, team_name)
    profile["ai_game_plan"] = _claude_offensive_plan(profile)
    return {"team_id": team_id, "season": SEASON, "ranked_by": rank_col, **profile}


@router.get("/league")
def league_defense_rankings():
    """All 30 teams ranked by defense with vulnerabilities and exploitation tactics."""
    try:
        opp = _fetch_league_defense()
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))

    league_avgs = opp.mean(numeric_only=True)

    # Sort by DEF_RATING ascending (pace-adjusted) - rank 1 = best defense
    rank_col = _rank_column(opp)
    opp_sorted = opp.sort_values(rank_col).reset_index(drop=True)

    team_id_to_info = {t["id"]: t for t in static_teams.get_teams()}

    teams_out = []
    for rank_idx, (_, row) in enumerate(opp_sorted.iterrows()):
        tid = int(row["TEAM_ID"])
        info = team_id_to_info.get(tid, {})
        team_name = info.get("full_name", f"Team #{tid}")
        abbrev = info.get("abbreviation", "")

        profile = _build_team_profile(row, league_avgs, rank_idx + 1, team_name)
        teams_out.append({
            "team_id": tid,
            "abbreviation": abbrev,
            "season": SEASON,
            **profile,
        })

    note = (
        "Ranked by Defensive Rating (points allowed per 100 possessions, pace-adjusted). "
        "Rank 1 = best defense."
        if rank_col == "DEF_RATING"
        else "Ranked by opponent PPG allowed (ascending). Rank 1 = best defense."
    )
    return {
        "season": SEASON,
        "teams": teams_out,
        "total_teams": len(teams_out),
        "ranked_by": rank_col,
        "note": note,
    }
