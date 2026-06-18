from app.config import settings
"""GM Assistant  " Claude-powered natural language Q&A with NBA context."""

import asyncio
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
- Salary cap 2024-25: ~$141M. Luxury tax line: ~$170M. First apron: ~$178M. Second apron: ~$189M.
- Trade salary matching: teams sending more must receive within 125% + $100K of salary sent.
- MLE (Mid-Level Exception): ~$12.4M for taxpayers, ~$5.7M for hard-cap teams.
- Restricted free agency: team has right of first refusal on their own RFAs.
"""


def _sleep():
    time.sleep(0.7)


def _build_context() -> str:
    try:
        _sleep()
        team_df = leaguedashteamstats.LeagueDashTeamStats(
            season=SEASON,
            measure_type_detailed_defense="Base",
            per_mode_detailed="PerGame",
            timeout=60,
        ).get_data_frames()[0]

        _sleep()
        player_df = leaguedashplayerstats.LeagueDashPlayerStats(
            season=SEASON,
            per_mode_detailed="PerGame",
            timeout=60,
        ).get_data_frames()[0]

        # Top 15 teams by win pct
        teams_sorted = team_df.sort_values("W_PCT", ascending=False).head(15)
        team_lines = []
        for _, r in teams_sorted.iterrows():
            team_lines.append(
                f"{r['TEAM_ABBREVIATION']}: {int(r['W'])}-{int(r['L'])} | "
                f"{float(r['PTS']):.1f} PPG | {float(r['OPP_PTS']):.1f} OPP PPG"
            )

        # Top 20 scorers
        scorers = player_df.sort_values("PTS", ascending=False).head(20)
        scorer_lines = []
        for _, r in scorers.iterrows():
            scorer_lines.append(
                f"{r['PLAYER_NAME']} ({r['TEAM_ABBREVIATION']}): "
                f"{float(r['PTS']):.1f} PPG / {float(r['REB']):.1f} RPG / {float(r['AST']):.1f} APG"
            )

        # League averages
        lg_pts = float(team_df["PTS"].mean())
        lg_fg = float(team_df["FG_PCT"].mean())
        lg_fg3 = float(team_df["FG3_PCT"].mean())

        context = (
            f"=== STANDINGS (Top 15 by Win%) ===\n" + "\n".join(team_lines) +
            f"\n\n=== TOP SCORERS ===\n" + "\n".join(scorer_lines) +
            f"\n\n=== LEAGUE AVERAGES ===\n"
            f"Points per game: {lg_pts:.1f} | FG%: {lg_fg:.1%} | 3P%: {lg_fg3:.1%}"
        )
        return context

    except Exception as e:
        return f"[Context unavailable: {e}]"


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


