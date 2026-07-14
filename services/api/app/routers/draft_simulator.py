"""
NBA Draft Simulator — Claude-powered.

Modes:
  - future      : generate a realistic future draft class + board + mock
  - historical  : real draft class with pre-draft scouting (control any team)
  - redraft     : re-rank a past draft by how careers actually played out

Claude does the generation/analysis, so this feature has NO NBA-API dependency
and works fully on the deployed (cloud) site.
"""

import json
import re
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from nba_api.stats.endpoints import drafthistory

from app.claude_client import chat_completion, is_available
from app import data_cache

router = APIRouter(prefix="/draft", tags=["draft"])

SONNET = "claude-sonnet-4-6"
HAIKU = "claude-haiku-4-5-20251001"


# ─────────────────────────────────────────────────────────────────────────────
# JSON helper
# ─────────────────────────────────────────────────────────────────────────────

def _parse_json(text: str) -> dict:
    """Extract a JSON object from a Claude response (handles ```json fences)."""
    t = text.strip()
    # strip code fences
    fence = re.search(r"```(?:json)?\s*(.+?)```", t, re.DOTALL)
    if fence:
        t = fence.group(1).strip()
    # find the outermost JSON object
    start = t.find("{")
    end = t.rfind("}")
    if start != -1 and end != -1:
        t = t[start:end + 1]
    try:
        return json.loads(t)
    except json.JSONDecodeError:
        # Forgive common LLM glitches: trailing commas before } or ]
        repaired = re.sub(r",(\s*[}\]])", r"\1", t)
        try:
            return json.loads(repaired)
        except json.JSONDecodeError as e:
            raise HTTPException(502, f"Model returned malformed JSON: {e}")


# ─────────────────────────────────────────────────────────────────────────────
# Real draft rosters (grounding) — eliminates wrong-year hallucinations
# ─────────────────────────────────────────────────────────────────────────────

def _fetch_draft_class_live(year: int) -> list[dict]:
    """Real list of players drafted in `year` from the NBA draft-history data."""
    df = drafthistory.DraftHistory(season_year_nullable=str(year), timeout=60).get_data_frames()[0]
    out = []
    for _, r in df.iterrows():
        pick = r.get("OVERALL_PICK")
        if not pick or str(pick) in ("", "nan"):
            continue
        team = f"{r.get('TEAM_CITY', '')} {r.get('TEAM_NAME', '')}".strip()
        out.append({
            "pick": int(pick),
            "round": int(r["ROUND_NUMBER"]) if r.get("ROUND_NUMBER") else None,
            "name": str(r.get("PLAYER_NAME", "")).strip(),
            "team": team,
            "college": str(r.get("ORGANIZATION", "")).strip(),
        })
    out.sort(key=lambda x: x["pick"])
    return out


def get_draft_class(year: int) -> list[dict]:
    """Cache-first (cloud) / live (local) real draft roster. [] if unavailable."""
    try:
        data = data_cache.cached_or_live(
            f"draft_{year}.json", lambda: _fetch_draft_class_live(year), kind="json"
        )
        return data or []
    except Exception:
        return []


def _roster_text(draft_class: list[dict], limit: int = 60) -> str:
    return "\n".join(
        f"#{p['pick']} {p['name']} ({p['team']})" for p in draft_class[:limit] if p.get("name")
    )


def _claude_json(model: str, system: str, user: str, max_tokens: int) -> dict:
    if not is_available():
        raise HTTPException(503, "ANTHROPIC_API_KEY not set — the Draft Simulator needs it.")
    try:
        text, _ = chat_completion(model, system, [{"role": "user", "content": user}], max_tokens)
    except ValueError as e:
        raise HTTPException(503, str(e))
    except Exception as e:
        raise HTTPException(502, f"Claude error: {e}")
    return _parse_json(text)


# ─────────────────────────────────────────────────────────────────────────────
# Request models
# ─────────────────────────────────────────────────────────────────────────────

class SetupRequest(BaseModel):
    year: int
    rounds: int = 1          # 1 = 30 picks, 2 = 60 picks
    mode: str = "future"     # future | historical
    board_size: int = 30     # how many prospects on the big board


class RedraftRequest(BaseModel):
    year: int
    count: int = 14          # how many picks to re-rank (lottery = 14, full = 30/60)


class PickRequest(BaseModel):
    year: int
    mode: str
    pick_number: int
    team: str
    prospect: dict           # the chosen prospect (name, position, etc.)
    team_needs: list[str] = []


class SimRequest(BaseModel):
    year: int
    mode: str
    from_pick: int           # sim starting at this pick
    to_pick: int             # ...up to (and including) this pick
    draft_order: list[dict]  # [{pick, team, needs}]
    available: list[dict]    # remaining big-board prospects
    already_picked: list[str] = []


# ─────────────────────────────────────────────────────────────────────────────
# Setup — board, order, needs, mock
# ─────────────────────────────────────────────────────────────────────────────

SETUP_SYSTEM = """You are an elite NBA Draft analyst running a draft simulator. Produce
realistic draft material. Respond with ONLY valid JSON — no prose, no markdown fences.

CRITICAL JSON RULES:
- Never put a double-quote (") character INSIDE any string value. Write heights with a
  dash, e.g. "6-8" (NOT 6'8"). No inch marks, no quoted nicknames.
- Keep each scouting field SHORT (a few words). Brevity matters.

Schema:
{
  "summary": "2-sentence overview of this draft class",
  "draft_order": [{"pick": 1, "team": "Team Name", "needs": ["need1","need2"]}],
  "big_board": [{
    "rank": 1, "name": "Full Name", "position": "PG/SG/SF/PF/C",
    "age": 19, "height": "6-8", "weight": 210, "origin": "school/country/team",
    "strengths": ["short s1","short s2"], "weaknesses": ["short w1","short w2"],
    "comparison": "NBA player comp", "projection": "role/ceiling in a few words",
    "bust_risk": "Low/Medium/High"
  }],
  "mock_draft": [{"pick": 1, "team": "Team Name", "prospect": "Full Name"}]
}"""


@router.post("/setup")
def draft_setup(body: SetupRequest):
    picks = 30 if body.rounds == 1 else 60
    board_size = max(body.board_size, picks)

    if body.mode == "future":
        ctx = (
            f"Generate a REALISTIC projected {body.year} NBA Draft class. Invent believable "
            f"prospects (or use real current young/college/international players who would "
            f"plausibly be in this class), with realistic measurements, scouting reports, and "
            f"NBA comparisons. Use a plausible {body.year} draft order and current-era team needs."
        )
    else:  # historical
        draft_class = get_draft_class(body.year)
        roster = _roster_text(draft_class, limit=picks) if draft_class else ""
        ctx = (
            f"Recreate the REAL {body.year} NBA Draft using only information known BEFORE that "
            f"draft happened: the actual draft order, actual prospects, period-accurate scouting "
            f"reports, measurements, and team needs. Do not use hindsight about their careers."
        )
        if roster:
            ctx += (
                f"\n\nUse EXACTLY these real players, pick numbers, and teams (do not add anyone "
                f"not listed, do not change pick order):\n{roster}"
            )
        else:
            ctx += (
                f"\nACCURACY: include ONLY players actually selected in the {body.year} draft — "
                f"never a player from a different draft year."
            )

    user = (
        f"{ctx}\n\n"
        f"Produce a {picks}-pick draft order, a Top {board_size} big board, and a full mock draft "
        f"for all {picks} picks. Keep scouting terse — realistic but brief."
    )
    # Haiku for speed: a detailed Sonnet board takes ~100s; Haiku is several times
    # faster and plenty good for a draft board. Generous token budget so the JSON
    # never truncates mid-array (truncation = malformed JSON).
    data = _claude_json(HAIKU, SETUP_SYSTEM, user, max_tokens=8000)
    data["year"] = body.year
    data["mode"] = body.mode
    data["picks"] = picks
    return data


# ─────────────────────────────────────────────────────────────────────────────
# Redraft — real order vs "should have been"
# ─────────────────────────────────────────────────────────────────────────────

REDRAFT_SYSTEM = """You are an NBA historian running a redraft. Given a real past draft, you
re-rank the players by how their NBA careers ACTUALLY turned out (accolades, longevity, peak
impact, winning).

CRITICAL ACCURACY RULES:
- Only include players who were ACTUALLY selected in THAT EXACT draft year. Never include a
  player drafted in a different year (e.g., do NOT put Kawhi Leonard — a 2011 pick — into a
  2010 redraft). Double-check each player's real draft year before including them.
- Use each player's REAL original pick number and team from that draft.
- If unsure whether a player belongs to that class, leave them out.

Respond with ONLY valid JSON — no prose, no fences. Schema:
{
  "summary": "2-sentence take on how this class is remembered",
  "redraft": [{
    "new_rank": 1, "name": "Full Name", "original_pick": 13, "original_team": "Team",
    "career_summary": "one line of what they became",
    "accolades": "MVPs/All-Stars/rings etc. in shorthand",
    "movement": "+12 / -3 / same vs original slot"
  }],
  "biggest_steal": {"name": "...", "original_pick": 41, "why": "..."},
  "biggest_bust": {"name": "...", "original_pick": 2, "why": "..."}
}"""


@router.post("/redraft")
def draft_redraft(body: RedraftRequest):
    draft_class = get_draft_class(body.year)
    if draft_class:
        grounding = (
            f"Here is the ACTUAL {body.year} NBA Draft (real pick numbers, players, and teams). "
            f"Re-rank ONLY players from THIS list — do not add anyone not listed:\n"
            f"{_roster_text(draft_class)}\n\n"
        )
    else:
        grounding = ""  # fall back to the model's memory (best-effort)

    user = (
        f"{grounding}"
        f"Redraft the {body.year} NBA Draft. Re-rank the top {body.count} based on actual career "
        f"outcomes (not where they were really picked). For each, give their original pick number "
        f"and team (use the real ones above), what their career became, accolades, and how far they "
        f"moved from their real slot. Also name the biggest steal and biggest bust of the class."
    )
    data = _claude_json(SONNET, REDRAFT_SYSTEM, user, max_tokens=6000)
    data["year"] = body.year
    data["grounded"] = bool(draft_class)
    return data


# ─────────────────────────────────────────────────────────────────────────────
# Pick grade — after a user selection
# ─────────────────────────────────────────────────────────────────────────────

GRADE_SYSTEM = """You are an NBA Draft analyst grading a single pick in real time. Respond with
ONLY valid JSON — no prose, no fences. Schema:
{
  "grade": "A+/A/A-/B+/B/B-/C+/C/C-/D/F",
  "comparison": "NBA player comp",
  "fit": "1-2 sentences on fit with the team's roster/needs",
  "risk": "Low/Medium/High",
  "peak_rating": 85,           // projected peak overall, 60-99 scale
  "bust_pct": 25,              // 0-100
  "allstar_pct": 40,           // 0-100
  "analysis": "2-sentence scouting verdict on the pick"
}"""


@router.post("/pick")
def draft_pick(body: PickRequest):
    p = body.prospect
    user = (
        f"{body.mode.title()} {body.year} draft. With pick #{body.pick_number}, the "
        f"{body.team} select {p.get('name')} ({p.get('position','?')}, "
        f"{p.get('origin','?')}). Team needs: {', '.join(body.team_needs) or 'unspecified'}.\n"
        f"Prospect scouting — strengths: {', '.join(p.get('strengths', []))}; "
        f"weaknesses: {', '.join(p.get('weaknesses', []))}; "
        f"pre-existing comp: {p.get('comparison','?')}.\n"
        f"Grade this specific pick (value at this slot + fit)."
    )
    return _claude_json(HAIKU, GRADE_SYSTEM, user, max_tokens=600)


# ─────────────────────────────────────────────────────────────────────────────
# Simulate — AI front offices pick until the user's next turn
# ─────────────────────────────────────────────────────────────────────────────

SIM_SYSTEM = """You are simulating NBA front-office decision-making across multiple draft picks.
For each pick in the requested range, choose the most realistic selection from the AVAILABLE
prospects given the team's needs and best-player-available logic. Respond with ONLY valid JSON —
no prose, no fences. Schema:
{
  "picks": [{
    "pick": 4, "team": "Team Name", "prospect": "Full Name",
    "grade": "A-/B+/...", "reasoning": "one line on why they took him"
  }]
}
You MUST only pick names that appear in the AVAILABLE list, and never pick the same player twice."""


@router.post("/simulate")
def draft_simulate(body: SimRequest):
    order_slice = [o for o in body.draft_order if body.from_pick <= o["pick"] <= body.to_pick]
    avail_names = [a.get("name") for a in body.available]
    user = (
        f"{body.mode.title()} {body.year} draft. Simulate picks {body.from_pick} through "
        f"{body.to_pick}.\n\n"
        f"Draft order for this range: {json.dumps(order_slice)}\n\n"
        f"AVAILABLE prospects (pick only from these names): {json.dumps(avail_names)}\n\n"
        f"Already taken: {', '.join(body.already_picked) or 'none'}.\n"
        f"Make realistic selections (team need + best available)."
    )
    return _claude_json(HAIKU, SIM_SYSTEM, user, max_tokens=3000)


@router.get("/status")
def draft_status():
    return {"ai_available": is_available()}
