from app.config import settings
"""GM Assistant  " Claude-powered natural language Q&A with NBA context."""

import asyncio
import re
import time
from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from nba_api.stats.endpoints import leaguedashteamstats, leaguedashplayerstats
from nba_api.stats.static import teams as static_teams

from app.claude_client import chat_completion, is_available

router = APIRouter(prefix="/gm-assistant", tags=["gm-assistant"])
SEASON = settings.current_season
MODEL = "claude-haiku-4-5-20251001"

_context_cache: Optional[str] = None
_context_ts: float = 0.0
CACHE_TTL = 7200.0

SYSTEM_TEMPLATE = """You are an expert NBA GM assistant with deep knowledge of basketball analytics, the CBA, salary cap rules, team building, and player evaluation.

You have access to the following current season ({season}) data:
{context}

Answer the user's question analytically and concisely. Be specific  " reference team names, player names, and data when available. If a question requires data you don't have, say so clearly rather than guessing.

Key rules to know:
- Salary cap 2025-26: ~$154.6M. Luxury tax line: ~$187.9M. First apron: ~$195.9M. Second apron: ~$207.8M.
- Trade salary matching: teams sending more must receive within 125% + $100K of salary sent.
- MLE (Mid-Level Exception): ~$14.1M non-taxpayer, ~$5.7M taxpayer, ~$8.8M room exception.
- Restricted free agency: team has right of first refusal on their own RFAs.

When TEAM SALARY CAP data is present below, use those specific per-team numbers for cap-space
and payroll questions. Negative cap space means the team is over the cap by that amount.
"""


def _sleep():
    time.sleep(0.7)


def _safe_float(v, default=0.0):
    try:
        f = float(v)
        return f if f == f else default  # NaN check
    except (TypeError, ValueError):
        return default


def _section_standings_scorers() -> str:
    """Standings + top scorers + league averages (live NBA; absent on cloud)."""
    try:
        _sleep()
        team_df = leaguedashteamstats.LeagueDashTeamStats(
            season=SEASON, measure_type_detailed_defense="Base",
            per_mode_detailed="PerGame", timeout=60,
        ).get_data_frames()[0]
        _sleep()
        player_df = leaguedashplayerstats.LeagueDashPlayerStats(
            season=SEASON, per_mode_detailed="PerGame", timeout=60,
        ).get_data_frames()[0]

        teams_sorted = team_df.sort_values("W_PCT", ascending=False).head(15)
        team_lines = [
            f"{r['TEAM_ABBREVIATION']}: {int(r['W'])}-{int(r['L'])} | "
            f"{_safe_float(r['PTS']):.1f} PPG | {_safe_float(r['OPP_PTS']):.1f} OPP PPG"
            for _, r in teams_sorted.iterrows()
        ]
        scorers = player_df.sort_values("PTS", ascending=False).head(20)
        scorer_lines = [
            f"{r['PLAYER_NAME']} ({r['TEAM_ABBREVIATION']}): "
            f"{_safe_float(r['PTS']):.1f} PPG / {_safe_float(r['REB']):.1f} RPG / {_safe_float(r['AST']):.1f} APG"
            for _, r in scorers.iterrows()
        ]
        lg_pts = _safe_float(team_df["PTS"].mean())
        lg_fg = _safe_float(team_df["FG_PCT"].mean())
        lg_fg3 = _safe_float(team_df["FG3_PCT"].mean())
        return (
            "=== STANDINGS (Top 15 by Win%) ===\n" + "\n".join(team_lines) +
            "\n\n=== TOP SCORERS ===\n" + "\n".join(scorer_lines) +
            f"\n\n=== LEAGUE AVERAGES ===\nPoints per game: {lg_pts:.1f} | "
            f"FG%: {lg_fg:.1%} | 3P%: {lg_fg3:.1%}"
        )
    except Exception:
        return ""


def _section_clutch() -> str:
    """Clutch leaders — cache-aware, so this works on the live site too."""
    try:
        from app.routers import clutch_dna
        data = clutch_dna._fetch_leaderboard()
        players = (data.get("players") or [])[:12]
        if not players:
            return ""
        lines = [
            f"{p['player_name']}: clutch score {p['clutch_score']} ({p['tier']}), "
            f"{p['clutch_pts']} clutch PPG, {_safe_float(p['clutch_fg_pct']) * 100:.1f}% clutch FG"
            for p in players
        ]
        return ("=== CLUTCH LEADERS (last 5 min, within 5 pts; ranked by clutch score) ===\n"
                + "\n".join(lines))
    except Exception:
        return ""


def _section_defense() -> str:
    """Best/worst defenses by Defensive Rating — cache-aware (works on cloud)."""
    try:
        from app.routers import defense_scanner
        df = defense_scanner._fetch_league_defense()
        if df is None or df.empty:
            return ""
        rank_col = "DEF_RATING" if "DEF_RATING" in df.columns and df["DEF_RATING"].notna().any() else "OPP_PTS"
        s = df.sort_values(rank_col)

        def line(r):
            drtg = _safe_float(r.get("DEF_RATING"))
            drtg_s = f"DRtg {drtg:.1f}, " if drtg else ""
            name = r.get("TEAM_ABBREVIATION") or r.get("TEAM_NAME", "?")
            return f"{name}: {drtg_s}{_safe_float(r.get('OPP_PTS')):.1f} OPP PPG"

        best = [line(r) for _, r in s.head(5).iterrows()]
        worst = [line(r) for _, r in s.tail(5).iterrows()]
        return ("=== BEST DEFENSES (by Def Rating) ===\n" + "\n".join(best) +
                "\n=== WEAKEST DEFENSES ===\n" + "\n".join(worst))
    except Exception:
        return ""


def _section_shot_defenders() -> str:
    """Best individual shot defenders by REAL matchup impact — how much a player
    lowers opponents' FG% when guarding them (per-player, not team-inflated)."""
    try:
        from nba_api.stats.endpoints import leaguedashptdefend
        _sleep()
        df = leaguedashptdefend.LeagueDashPtDefend(
            season=SEASON, defense_category="Overall",
            per_mode_simple="PerGame", timeout=60,
        ).get_data_frames()[0]
        # High volume + enough games so the leaderboard is real anchors, not
        # small-sample flukes (low-minute players post extreme deltas on ~4 FGA).
        df = df.assign(
            _fga=df["D_FGA"].apply(_safe_float),
            _gp=df["GP"].apply(_safe_float),
            _pm=df["PCT_PLUSMINUS"].apply(_safe_float),
        )
        df = df[(df["_fga"] >= 7.0) & (df["_gp"] >= 30)]
        if df.empty:
            return ""
        best = df.sort_values("_pm").head(12)

        def line(r):
            return (f"{r['PLAYER_NAME']}: opp FG% {_safe_float(r['D_FG_PCT'])*100:.1f}% vs "
                    f"{_safe_float(r['NORMAL_FG_PCT'])*100:.1f}% normal "
                    f"({_safe_float(r['PCT_PLUSMINUS'])*100:+.1f}%), on {_safe_float(r['D_FGA']):.1f} FGA/g")
        return ("=== BEST SHOT DEFENDERS (opponent FG% impact when guarding; "
                "more negative = better) ===\n" + "\n".join(line(r) for _, r in best.iterrows()))
    except Exception:
        return ""


_SPOTRAC_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.google.com/",
}


def _money_to_int(s: str) -> int:
    """'$-3,003,285' -> -3003285; non-numeric -> 0."""
    digits = re.sub(r"[^\d-]", "", s or "")
    try:
        return int(digits)
    except ValueError:
        return 0


def _section_cap() -> str:
    """Team salary-cap space scraped from Spotrac.

    Fragile by nature: depends on Spotrac's HTML and their bot policy. It may be
    rate-limited or blocked (especially from cloud IPs) — in which case it returns
    "" and the assistant simply won't have team cap numbers this session.
    """
    try:
        import requests
        import lxml.html as H

        year = SEASON.split("-")[0]  # "2025-26" -> "2025"
        url = f"https://www.spotrac.com/nba/cap/_/year/{year}"
        r = requests.get(url, headers=_SPOTRAC_HEADERS, timeout=20)
        if r.status_code != 200:
            return ""

        doc = H.fromstring(r.text)
        entries = []  # (team, total_committed, cap_space, dead_money)
        for tr in doc.xpath("//table//tr"):
            cells = [c.text_content().strip() for c in tr.xpath("./td")]
            if len(cells) < 7:
                continue
            team = cells[1].split()[0] if cells[1].split() else cells[1]
            if not re.fullmatch(r"[A-Z]{2,3}", team):  # skip totals/average rows
                continue
            entries.append((team, cells[5], cells[6], cells[-1]))

        if not entries:
            return ""

        entries.sort(key=lambda e: _money_to_int(e[2]), reverse=True)
        lines = [
            f"{team}: cap space {space}, total committed {total}, dead money {dead}"
            for (team, total, space, dead) in entries
        ]
        return (
            f"=== TEAM SALARY CAP ({SEASON}, via Spotrac; sorted by cap space, "
            "most to least; negative = over the cap) ===\n" + "\n".join(lines)
        )
    except Exception:
        return ""


def _build_context() -> str:
    sections = [
        _section_standings_scorers(),
        _section_clutch(),
        _section_defense(),
        _section_shot_defenders(),
        _section_cap(),
    ]
    ctx = "\n\n".join(s for s in sections if s)
    return ctx or "[No live data sections available this session.]"


def _get_context() -> str:
    import time as _t
    global _context_cache, _context_ts
    if _context_cache and (_t.time() - _context_ts) < CACHE_TTL:
        return _context_cache
    ctx = _build_context()
    _context_cache = ctx
    _context_ts = _t.time()
    return ctx


class ChatRequest(BaseModel):
    message: str
    history: list[dict] = []  # [{"role": "user"|"assistant", "content": "..."}]


class ChatResponse(BaseModel):
    reply: str
    model: str
    tokens_used: int


def _do_chat(message: str, history: list[dict], context: str) -> tuple[str, int]:
    system = SYSTEM_TEMPLATE.format(season=SEASON, context=context)
    messages = history[-10:] + [{"role": "user", "content": message}]
    return chat_completion(model=MODEL, system=system, messages=messages, max_tokens=800)


@router.post("/chat", response_model=ChatResponse)
async def gm_chat(body: ChatRequest):
    if not is_available():
        raise HTTPException(
            status_code=503,
            detail="GM Assistant requires ANTHROPIC_API_KEY. Add it to services/api/.env and restart.",
        )

    try:
        context = await asyncio.to_thread(_get_context)
        reply, tokens = await asyncio.to_thread(_do_chat, body.message, body.history, context)
    except ValueError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return ChatResponse(reply=reply, model=MODEL, tokens_used=tokens)


