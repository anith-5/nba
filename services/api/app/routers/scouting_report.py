"""AI Scouting Report — aggregates player data and calls Claude to write report."""

import asyncio
import time
from fastapi import APIRouter, HTTPException
from nba_api.stats.endpoints import commonplayerinfo, leaguedashplayerstats, playercareerstats

from app.claude_client import chat_completion, is_available

router = APIRouter(prefix="/scouting", tags=["scouting"])
SEASON = "2024-25"
MODEL = "claude-sonnet-4-6"

SYSTEM_PROMPT = """You are a professional NBA scout writing a report for a front office.
Write in the style of a real NBA scouting report: concise, analytical, data-backed.
Use this structure exactly:

**Overview** (2 sentences — role and value)
**Offensive Profile** (3 bullets)
**Defensive Profile** (2 bullets)
**Best Comparable** (1 historical player with brief reason)
**Outlook** (1 sentence — ceiling/floor assessment)
**Trade Value** (1 sentence)

Be specific. Reference the stats provided. No filler."""


def _sleep():
    time.sleep(0.7)


def _gather_data(player_id: int) -> dict:
    _sleep()
    info_raw = commonplayerinfo.CommonPlayerInfo(player_id=player_id, timeout=60)
    info_rs = info_raw.get_data_frames()[0]

    if info_rs.empty:
        raise HTTPException(status_code=404, detail="Player not found.")

    info = info_rs.iloc[0]
    name = str(info.get("DISPLAY_FIRST_LAST", f"Player #{player_id}"))
    age = int(info.get("SEASON_EXP", 0)) + 18  # approximation
    team = str(info.get("TEAM_ABBREVIATION", ""))
    position = str(info.get("POSITION", ""))
    height = str(info.get("HEIGHT", ""))
    country = str(info.get("COUNTRY", ""))

    _sleep()
    season_stats_df = leaguedashplayerstats.LeagueDashPlayerStats(
        season=SEASON,
        per_mode_simple="PerGame",
        timeout=60,
    ).get_data_frames()[0]

    player_row = season_stats_df[season_stats_df["PLAYER_ID"] == player_id]
    if player_row.empty:
        stats = {}
    else:
        r = player_row.iloc[0]
        gp = int(r.get("GP", 0))
        pts = float(r.get("PTS", 0))
        reb = float(r.get("REB", 0))
        ast = float(r.get("AST", 0))
        fg = float(r.get("FG_PCT", 0))
        fg3 = float(r.get("FG3_PCT", 0))
        ft = float(r.get("FT_PCT", 0))
        stl = float(r.get("STL", 0))
        blk = float(r.get("BLK", 0))
        tov = float(r.get("TOV", 0))
        min_ = float(r.get("MIN", 0))
        fga = float(r.get("FGA", 1))
        fta = float(r.get("FTA", 0))
        ts_pct = pts / (2 * (fga + 0.44 * fta)) if (fga + 0.44 * fta) > 0 else 0.0
        stats = {
            "gp": gp, "pts": round(pts, 1), "reb": round(reb, 1), "ast": round(ast, 1),
            "fg_pct": round(fg, 3), "fg3_pct": round(fg3, 3), "ft_pct": round(ft, 3),
            "stl": round(stl, 1), "blk": round(blk, 1), "tov": round(tov, 1),
            "min": round(min_, 1), "ts_pct": round(ts_pct, 3),
        }

    return {"name": name, "age": age, "team": team, "position": position,
            "height": height, "country": country, "stats": stats}


def _call_claude(data: dict, team_context: str) -> tuple[str, int]:
    s = data["stats"]
    user_msg = (
        f"Player: {data['name']}, Age: {data['age']}, Team: {data['team']}, "
        f"Position: {data['position']}, Height: {data['height']}, Country: {data['country']}\n"
        f"Season averages ({SEASON}): {s.get('pts', 'N/A')} PPG, {s.get('reb', 'N/A')} RPG, "
        f"{s.get('ast', 'N/A')} APG, {s.get('min', 'N/A')} MPG, "
        f"{s.get('fg_pct', 0):.1%} FG, {s.get('fg3_pct', 0):.1%} 3P, "
        f"{s.get('ts_pct', 0):.1%} TS%, {s.get('stl', 'N/A')} STL, {s.get('blk', 'N/A')} BLK\n"
        f"Games played: {s.get('gp', 'N/A')}"
    )
    if team_context:
        user_msg += f"\n\nEvaluating fit for: {team_context}"

    return chat_completion(
        model=MODEL,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_msg}],
        max_tokens=600,
    )


@router.post("/player/{player_id}")
async def scouting_report(player_id: int, team_context: str = ""):
    if not is_available():
        raise HTTPException(
            status_code=503,
            detail="AI scouting requires ANTHROPIC_API_KEY. Add it to services/api/.env and restart.",
        )

    try:
        data = await asyncio.to_thread(_gather_data, player_id)
        report_text, tokens = await asyncio.to_thread(_call_claude, data, team_context)
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return {
        "player_id": player_id,
        "player_name": data["name"],
        "team": data["team"],
        "season": SEASON,
        "report": report_text,
        "stats_used": data["stats"],
        "model": MODEL,
        "tokens_used": tokens,
    }
