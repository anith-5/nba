"""Trade Machine - realistic NBA trade analyzer with GM personalities and CBA rules."""

import asyncio
import re
import time
from io import StringIO
from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from nba_api.stats.endpoints import leaguedashplayerstats
from nba_api.stats.static import teams as static_teams
import httpx
import pandas as pd

from app.config import settings
from app.claude_client import chat_completion, is_available

router = APIRouter(prefix="/trades", tags=["trades"])
SEASON = settings.current_season

_player_cache: Optional[list] = None
_player_cache_ts: float = 0.0
PLAYER_CACHE_TTL = 3600.0

_salary_cache: Optional[dict] = None
_salary_cache_ts: float = 0.0
SALARY_CACHE_TTL = 86400.0  # 24 hours


def _fetch_bbref_salaries() -> dict:
    """Fetch current NBA salary data from Basketball Reference."""
    url = "https://www.basketball-reference.com/contracts/players.html"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
    }
    resp = httpx.get(url, headers=headers, timeout=20, follow_redirects=True)
    resp.raise_for_status()

    tables = pd.read_html(StringIO(resp.text), flavor="lxml")
    if not tables:
        return {}

    df = tables[0]
    # Flatten multi-level columns if needed
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = [" ".join(str(c) for c in col if str(c) != "nan").strip() for col in df.columns]

    # Find player name column and current season salary column
    name_col = next((c for c in df.columns if "player" in c.lower()), None)
    # Look for 2025-26 or 2024-25 salary column
    sal_col = next((c for c in df.columns if "2025-26" in c), None)
    if sal_col is None:
        sal_col = next((c for c in df.columns if "2024-25" in c), None)

    if name_col is None or sal_col is None:
        return {}

    result = {}
    for _, row in df.iterrows():
        name = str(row[name_col]).strip()
        sal_raw = str(row[sal_col]).replace("$", "").replace(",", "").strip()
        if not name or name.lower() in ("player", "nan", ""):
            continue
        try:
            sal_m = float(sal_raw) / 1_000_000
            result[name.lower()] = round(sal_m, 2)
        except (ValueError, TypeError):
            pass
    return result


async def _get_salaries() -> dict:
    global _salary_cache, _salary_cache_ts
    import time as _t
    if _salary_cache and (_t.time() - _salary_cache_ts) < SALARY_CACHE_TTL:
        return _salary_cache
    try:
        data = await asyncio.to_thread(_fetch_bbref_salaries)
        if data:
            _salary_cache = data
            _salary_cache_ts = _t.time()
            return data
    except Exception:
        pass
    return _salary_cache or {}

# ---------------------------------------------------------------------------
# GM profiles for all 30 NBA teams
# win_now/youth_pref/star_desire/pick_value/cap_frugal all 0-10
# ---------------------------------------------------------------------------
GM_PROFILES = {
    "ATL": {
        "name": "Landry Fields", "win_now": 4, "youth_pref": 8, "star_desire": 6,
        "pick_value": 8, "cap_frugal": 7,
        "style": "Patient rebuilder focused on developing young talent and culture reset.",
        "tendencies": ["Prefers draft capital over win-now moves", "Develops youth over quick fixes", "Cap-conscious, avoids long commitments"],
    },
    "BOS": {
        "name": "Brad Stevens", "win_now": 9, "youth_pref": 4, "star_desire": 8,
        "pick_value": 6, "cap_frugal": 4,
        "style": "Analytics-driven. Prioritizes two-way players and sustainable winning.",
        "tendencies": ["Values high-IQ two-way players", "Will pay for proven winners", "Data-backed decisions over gut calls"],
    },
    "BKN": {
        "name": "Sean Marks", "win_now": 3, "youth_pref": 9, "star_desire": 4,
        "pick_value": 9, "cap_frugal": 8,
        "style": "Full rebuild — aggressive pick accumulator, long-term vision.",
        "tendencies": ["Hoards picks relentlessly", "Avoids expensive veterans", "Rebuilding through youth and assets"],
    },
    "CHA": {
        "name": "Mitch Kupchak", "win_now": 5, "youth_pref": 7, "star_desire": 6,
        "pick_value": 7, "cap_frugal": 6,
        "style": "Veteran GM valuing flexibility and athletic upside.",
        "tendencies": ["Patient, measured approach", "Likes high-upside players", "Flexible cap management"],
    },
    "CHI": {
        "name": "Arturas Karnisovas", "win_now": 6, "youth_pref": 6, "star_desire": 7,
        "pick_value": 7, "cap_frugal": 6,
        "style": "European-influenced, values skill and playmaking at every position.",
        "tendencies": ["Prioritizes skill over raw athleticism", "Builds around ball-handlers", "Balanced approach to assets"],
    },
    "CLE": {
        "name": "Koby Altman", "win_now": 8, "youth_pref": 5, "star_desire": 7,
        "pick_value": 6, "cap_frugal": 5,
        "style": "Loyal to proven core, prioritizes defensive identity and team cohesion.",
        "tendencies": ["Stays loyal to building blocks", "Values defensive versatility", "Team chemistry first"],
    },
    "DAL": {
        "name": "Nico Harrison", "win_now": 9, "youth_pref": 3, "star_desire": 10,
        "pick_value": 3, "cap_frugal": 2,
        "style": "Aggressive star-chaser who leverages all assets to maximize Doncic's window.",
        "tendencies": ["Trades picks for stars without hesitation", "All-in mentality every offseason", "Short-term over long-term always"],
    },
    "DEN": {
        "name": "Calvin Booth", "win_now": 8, "youth_pref": 5, "star_desire": 7,
        "pick_value": 7, "cap_frugal": 7,
        "style": "Conservative. Protects championship core, avoids tax exposure.",
        "tendencies": ["Maintains Jokic-era nucleus", "Cap-disciplined role player additions", "Prefers proven veterans on short deals"],
    },
    "DET": {
        "name": "Troy Weaver", "win_now": 2, "youth_pref": 10, "star_desire": 4,
        "pick_value": 9, "cap_frugal": 8,
        "style": "Full youth movement — draft heavy, long-term rebuild.",
        "tendencies": ["Full rebuild mode, no shortcuts", "Hoards picks aggressively", "Develops through losing, stays patient"],
    },
    "GSW": {
        "name": "Mike Dunleavy Jr.", "win_now": 7, "youth_pref": 6, "star_desire": 8,
        "pick_value": 6, "cap_frugal": 5,
        "style": "Legacy-conscious, extending Warriors dynasty while building for next era.",
        "tendencies": ["Balances Curry window with youth development", "Values basketball IQ heavily", "Willing to pay proven contributors"],
    },
    "HOU": {
        "name": "Rafael Stone", "win_now": 4, "youth_pref": 9, "star_desire": 7,
        "pick_value": 10, "cap_frugal": 7,
        "style": "Analytics pioneer. Massive pick hoarder building around young core.",
        "tendencies": ["Arguably the best asset accumulator in NBA", "Never trades picks cheaply", "Developing Jalen Green/Sengun era patiently"],
    },
    "IND": {
        "name": "Kevin Pritchard", "win_now": 7, "youth_pref": 6, "star_desire": 7,
        "pick_value": 7, "cap_frugal": 7,
        "style": "Classic Midwest GM — values toughness, team play, cap efficiency.",
        "tendencies": ["Targets undervalued and overlooked players", "Team-first culture builder", "Cap-smart, avoids overpaying"],
    },
    "LAC": {
        "name": "Lawrence Frank", "win_now": 8, "youth_pref": 4, "star_desire": 9,
        "pick_value": 5, "cap_frugal": 2,
        "style": "Ballmer-backed unlimited spender. Aggressive contender-building.",
        "tendencies": ["Unlimited payroll flexibility", "Targets proven stars at any cost", "Short-term winning is the mandate"],
    },
    "LAL": {
        "name": "Rob Pelinka", "win_now": 9, "youth_pref": 3, "star_desire": 10,
        "pick_value": 3, "cap_frugal": 2,
        "style": "LeBron-era GM. Trades everything for star power and immediate impact.",
        "tendencies": ["Moves picks for stars without hesitation", "LeBron/AD-centric decision making", "Market pressure demands stars"],
    },
    "MEM": {
        "name": "Zach Kleiman", "win_now": 8, "youth_pref": 6, "star_desire": 8,
        "pick_value": 7, "cap_frugal": 6,
        "style": "Young, bold GM. Analytics-backed, aggressive trader around Morant.",
        "tendencies": ["Makes bold trades when opportunity arises", "Values athleticism and upside", "Builds around Ja's strengths"],
    },
    "MIA": {
        "name": "Pat Riley", "win_now": 8, "youth_pref": 5, "star_desire": 9,
        "pick_value": 6, "cap_frugal": 5,
        "style": "Legendary culture-first GM. Heat Culture is non-negotiable.",
        "tendencies": ["Character and competitive drive over raw talent", "Defensive identity mandatory", "Will sacrifice picks for high-IQ competitors"],
    },
    "MIL": {
        "name": "Jon Horst", "win_now": 9, "youth_pref": 4, "star_desire": 8,
        "pick_value": 5, "cap_frugal": 4,
        "style": "All-in on Giannis championship window. Every move maximizes now.",
        "tendencies": ["Every decision serves Giannis timeline", "Targets proven defensive players", "Luxury tax is not a deterrent"],
    },
    "MIN": {
        "name": "Tim Connelly", "win_now": 8, "youth_pref": 5, "star_desire": 9,
        "pick_value": 7, "cap_frugal": 5,
        "style": "Built Jokic's Denver dynasty. Balances elite talent with future planning.",
        "tendencies": ["Builds around transcendent talents", "Aggressive when opportunity arises", "Balances future and present effectively"],
    },
    "NOP": {
        "name": "David Griffin", "win_now": 7, "youth_pref": 5, "star_desire": 8,
        "pick_value": 6, "cap_frugal": 6,
        "style": "Aggressive trader who built LeBron's Cleveland champion. Unafraid of big moves.",
        "tendencies": ["Targets character and competitive players", "Makes bold trades when opportunity knocks", "Maximizes Zion's window"],
    },
    "NYK": {
        "name": "Leon Rose", "win_now": 8, "youth_pref": 5, "star_desire": 9,
        "pick_value": 5, "cap_frugal": 4,
        "style": "Agent-turned-GM with massive asset base. NYC demands stars.",
        "tendencies": ["Will overpay in picks for marquee talent", "Market pressure to deliver stars", "Built strong asset base to leverage"],
    },
    "OKC": {
        "name": "Sam Presti", "win_now": 5, "youth_pref": 9, "star_desire": 7,
        "pick_value": 10, "cap_frugal": 8,
        "style": "The ultimate asset accumulator. Never gives up picks. Maximum patience.",
        "tendencies": ["Never trades picks without extreme value", "Patience over urgency, always", "Develops through youth, refuses shortcuts"],
    },
    "ORL": {
        "name": "Jeff Weltman", "win_now": 5, "youth_pref": 9, "star_desire": 6,
        "pick_value": 8, "cap_frugal": 7,
        "style": "Patient rebuilder with excellent player development infrastructure.",
        "tendencies": ["Develops young core systematically", "Rarely makes splash trades", "Cap flexibility is a core priority"],
    },
    "PHI": {
        "name": "Daryl Morey", "win_now": 10, "youth_pref": 2, "star_desire": 10,
        "pick_value": 3, "cap_frugal": 1,
        "style": "Analytics godfather. All-in for superstar talent, trades future for present.",
        "tendencies": ["Trades everything for elite scorers", "Future picks are chips to play, not hold", "Embiid window creates extreme urgency"],
    },
    "PHX": {
        "name": "James Jones", "win_now": 9, "youth_pref": 4, "star_desire": 9,
        "pick_value": 4, "cap_frugal": 3,
        "style": "Big-swing GM. Made the Durant trade. Maximizes Booker window.",
        "tendencies": ["Takes historic swings for elite talent", "Maximizes Kevin Durant/Booker window", "Significant asset packages expected"],
    },
    "POR": {
        "name": "Joe Cronin", "win_now": 3, "youth_pref": 9, "star_desire": 5,
        "pick_value": 9, "cap_frugal": 8,
        "style": "Full rebuild post-Lillard. Patient, accumulating young talent and picks.",
        "tendencies": ["Full rebuild, no urgency", "Accumulating young talent and assets", "Patience is the plan, period"],
    },
    "SAC": {
        "name": "Monte McNair", "win_now": 7, "youth_pref": 6, "star_desire": 7,
        "pick_value": 7, "cap_frugal": 6,
        "style": "Analytics-influenced ex-Rockets exec. Builds efficiency around Fox.",
        "tendencies": ["Values shooting and floor spacing", "Builds around De'Aaron Fox", "Targets efficient role players"],
    },
    "SAS": {
        "name": "Brian Wright", "win_now": 4, "youth_pref": 9, "star_desire": 5,
        "pick_value": 8, "cap_frugal": 7,
        "style": "Pop-influenced process builder. Wemby development is sacred.",
        "tendencies": ["Wemby development takes priority above all", "Patience and process over shortcuts", "Full rebuild, no compromises"],
    },
    "TOR": {
        "name": "Bobby Webster", "win_now": 5, "youth_pref": 8, "star_desire": 6,
        "pick_value": 8, "cap_frugal": 7,
        "style": "Raptors Way: develop through the draft, value length and athleticism.",
        "tendencies": ["Sticks to Raptors development model", "Values length, athleticism, versatility", "Rarely makes win-now trades"],
    },
    "UTA": {
        "name": "Justin Zanik", "win_now": 5, "youth_pref": 7, "star_desire": 6,
        "pick_value": 8, "cap_frugal": 7,
        "style": "Sitting on Ainge's massive pick haul. Threading rebuild vs competing.",
        "tendencies": ["Manages enormous pick assets carefully", "Developing young core around picks", "Smart asset management, no panic moves"],
    },
    "WAS": {
        "name": "Michael Winger", "win_now": 4, "youth_pref": 8, "star_desire": 6,
        "pick_value": 8, "cap_frugal": 7,
        "style": "New-era GM building post-Wall/Beal era. Prioritizes culture and character.",
        "tendencies": ["Culture and character rebuild", "Building around young talent", "Patient approach, long-term thinking"],
    },
}


def _sleep():
    time.sleep(0.7)


def _fetch_player_pool() -> list:
    _sleep()
    df = leaguedashplayerstats.LeagueDashPlayerStats(
        season=SEASON,
        per_mode_detailed="PerGame",
        timeout=60,
    ).get_data_frames()[0]

    players = []
    for _, r in df.iterrows():
        gp = int(r.get("GP", 0))
        if gp < 5:
            continue
        players.append({
            "player_id": int(r["PLAYER_ID"]),
            "name": str(r["PLAYER_NAME"]),
            "team": str(r["TEAM_ABBREVIATION"]),
            "pts": round(float(r.get("PTS", 0)), 1),
            "ast": round(float(r.get("AST", 0)), 1),
            "reb": round(float(r.get("REB", 0)), 1),
            "gp": gp,
            "min": round(float(r.get("MIN", 0)), 1),
        })
    return sorted(players, key=lambda x: x["pts"], reverse=True)


async def _get_player_pool() -> list:
    global _player_cache, _player_cache_ts
    import time as _t
    if _player_cache and (_t.time() - _player_cache_ts) < PLAYER_CACHE_TTL:
        return _player_cache
    pool = await asyncio.to_thread(_fetch_player_pool)
    _player_cache = pool
    _player_cache_ts = _t.time()
    return pool


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/teams")
def get_teams():
    all_teams = static_teams.get_teams()
    return [
        {
            "id": t["id"],
            "abbreviation": t["abbreviation"],
            "name": t["full_name"],
            "has_gm_profile": t["abbreviation"] in GM_PROFILES,
        }
        for t in sorted(all_teams, key=lambda x: x["full_name"])
        if t["abbreviation"] in GM_PROFILES  # only active NBA teams
    ]


@router.get("/players/search")
async def search_players(q: str = ""):
    if len(q) < 2:
        return []
    try:
        pool, salaries = await asyncio.gather(_get_player_pool(), _get_salaries())
        q_lower = q.lower()
        matches = [p for p in pool if q_lower in p["name"].lower()][:12]
        for p in matches:
            p["salary_millions"] = salaries.get(p["name"].lower())
        return matches
    except Exception as e:
        raise HTTPException(502, f"NBA API error: {e}")


# ---------------------------------------------------------------------------
# Trade analysis models
# ---------------------------------------------------------------------------

class TradePlayer(BaseModel):
    name: str
    salary_millions: float = Field(0.0, ge=0)


class TradeSide(BaseModel):
    team_abbr: str
    team_name: str
    sends: list[TradePlayer] = Field(default_factory=list)


class TradeAnalysisRequest(BaseModel):
    sides: list[TradeSide] = Field(..., min_length=2, max_length=2)


# ---------------------------------------------------------------------------
# Analysis helpers
# ---------------------------------------------------------------------------

def _cba_match(sends_a: float, sends_b: float) -> dict:
    """Simplified CBA salary matching: 125% + $100K rule both directions."""
    a_max_receive = sends_a * 1.25 + 0.1
    b_max_receive = sends_b * 1.25 + 0.1
    a_receives = sends_b
    b_receives = sends_a
    a_ok = a_receives <= a_max_receive or sends_a == 0
    b_ok = b_receives <= b_max_receive or sends_b == 0
    return {
        "valid": a_ok and b_ok,
        "team_a_sends": round(sends_a, 1),
        "team_a_receives": round(a_receives, 1),
        "team_a_max_receive": round(a_max_receive, 1),
        "team_a_ok": a_ok,
        "team_b_sends": round(sends_b, 1),
        "team_b_receives": round(b_receives, 1),
        "team_b_max_receive": round(b_max_receive, 1),
        "team_b_ok": b_ok,
    }


def _score_gm_fit(gm: dict, receiving_salary: float, sending_salary: float, player_count: int) -> tuple[float, list[str]]:
    score = 0.5
    reasons = []
    avg_salary = receiving_salary / max(1, player_count) if player_count else 0
    net_change = receiving_salary - sending_salary

    is_star_incoming = avg_salary >= 22
    is_rotation_incoming = 8 <= avg_salary < 22
    is_cheap_incoming = avg_salary < 8

    # Win-now vs rebuild fit
    if gm["win_now"] >= 8:
        if is_star_incoming:
            score += 0.25
            reasons.append(f"{gm['name']} aggressively pursues proven star talent - excellent fit")
        elif is_rotation_incoming:
            score += 0.1
            reasons.append(f"{gm['name']} can use quality rotation pieces to complement their core")
        elif is_cheap_incoming:
            score -= 0.15
            reasons.append(f"{gm['name']} is in win-now mode - cheap/young players don't move the needle")
    elif gm["win_now"] <= 4:
        if is_cheap_incoming:
            score += 0.2
            reasons.append(f"{gm['name']} is rebuilding - cheaper contracts give future flexibility")
        elif is_star_incoming and receiving_salary > 25:
            score -= 0.25
            reasons.append(f"{gm['name']} is in rebuild mode - a max star disrupts the long-term plan")
        elif is_rotation_incoming:
            score -= 0.05
            reasons.append(f"{gm['name']} would prefer picks or youth over a rotation player")
    else:
        if is_star_incoming:
            score += 0.15
            reasons.append(f"{gm['name']} is in a middle ground and could use a star boost")
        elif is_rotation_incoming:
            score += 0.1
            reasons.append(f"{gm['name']} can plug in quality rotation pieces")

    # Cap frugality vs salary change
    if gm["cap_frugal"] >= 7 and net_change > 12:
        score -= 0.15
        reasons.append(f"{gm['name']} is cap-conscious - absorbing ${net_change:.0f}M more salary is a concern")
    elif gm["cap_frugal"] <= 3 and net_change > 0:
        score += 0.05
        reasons.append(f"{gm['name']} has owner backing - cap increase is not a barrier")

    # Shedding salary
    if net_change < -5 and gm["cap_frugal"] >= 6:
        score += 0.1
        reasons.append(f"{gm['name']} appreciates shedding ${abs(net_change):.0f}M in payroll")
    elif net_change < -10 and gm["pick_value"] >= 7:
        reasons.append(f"Clearing significant salary gives {gm['name']} future flexibility to add picks or talent")

    return round(min(1.0, max(0.0, score)), 2), reasons


def _likelihood_label(score: float) -> str:
    if score >= 0.80: return "Very Likely"
    if score >= 0.65: return "Likely"
    if score >= 0.50: return "Possible"
    if score >= 0.35: return "Unlikely"
    return "Very Unlikely"


def _grade(score: float) -> str:
    grades = ["F", "D", "D+", "C-", "C", "C+", "B-", "B", "B+", "A-", "A", "A+"]
    idx = min(11, int(score * 12))
    return grades[idx]


# ---------------------------------------------------------------------------
# Main analyze endpoint
# ---------------------------------------------------------------------------

@router.post("/analyze")
async def analyze_trade(body: TradeAnalysisRequest):
    side_a = body.sides[0]
    side_b = body.sides[1]

    gm_a = GM_PROFILES.get(side_a.team_abbr.upper())
    gm_b = GM_PROFILES.get(side_b.team_abbr.upper())

    if not gm_a:
        raise HTTPException(400, f"No GM profile for team: {side_a.team_abbr}")
    if not gm_b:
        raise HTTPException(400, f"No GM profile for team: {side_b.team_abbr}")

    salary_a = sum(p.salary_millions for p in side_a.sends)
    salary_b = sum(p.salary_millions for p in side_b.sends)

    cba = _cba_match(salary_a, salary_b)

    # Each team's fit = how well they like what they're RECEIVING
    fit_a, reasons_a = _score_gm_fit(gm_a, salary_b, salary_a, len(side_b.sends))
    fit_b, reasons_b = _score_gm_fit(gm_b, salary_a, salary_b, len(side_a.sends))

    if not cba["valid"]:
        fit_a = fit_a * 0.3
        fit_b = fit_b * 0.3

    likelihood = round((fit_a + fit_b) / 2, 2)

    # AI summary
    ai_summary = None
    if is_available():
        a_out = ", ".join(f"{p.name} (${p.salary_millions:.1f}M)" for p in side_a.sends) or "nothing"
        b_out = ", ".join(f"{p.name} (${p.salary_millions:.1f}M)" for p in side_b.sends) or "nothing"
        prompt = (
            f"NBA Trade Scenario:\n"
            f"{side_a.team_name} sends: {a_out}\n"
            f"{side_b.team_name} sends: {b_out}\n\n"
            f"GMs involved:\n"
            f"- {gm_a['name']} ({side_a.team_abbr}): {gm_a['style']}\n"
            f"- {gm_b['name']} ({side_b.team_abbr}): {gm_b['style']}\n\n"
            f"CBA salary matching: {'VALID' if cba['valid'] else 'INVALID - does not match'}\n"
            f"Trade likelihood estimate: {_likelihood_label(likelihood)} ({likelihood:.0%})\n\n"
            f"In 4-5 sentences: Explain why each GM would or wouldn't make this trade. "
            f"Reference their specific tendencies, team situation, salary cap implications, and player fit. "
            f"Be direct and analytical — name the GMs, name the players."
        )
        try:
            text, _ = await asyncio.to_thread(
                chat_completion,
                model="claude-haiku-4-5-20251001",
                system="You are an expert NBA front office analyst. Be specific, analytical, and direct. Reference GMs and players by name.",
                messages=[{"role": "user", "content": prompt}],
                max_tokens=350,
            )
            ai_summary = text
        except Exception:
            pass

    return {
        "cba_check": cba,
        "salary_valid": cba["valid"],
        "trade_likelihood": likelihood,
        "likelihood_label": _likelihood_label(likelihood),
        "team_a": {
            "abbr": side_a.team_abbr,
            "team": side_a.team_name,
            "gm_name": gm_a["name"],
            "gm_style": gm_a["style"],
            "gm_tendencies": gm_a["tendencies"],
            "sends": [{"name": p.name, "salary": p.salary_millions} for p in side_a.sends],
            "receives": [{"name": p.name, "salary": p.salary_millions} for p in side_b.sends],
            "fit_score": fit_a,
            "fit_reasons": reasons_a,
            "grade": _grade(fit_a),
        },
        "team_b": {
            "abbr": side_b.team_abbr,
            "team": side_b.team_name,
            "gm_name": gm_b["name"],
            "gm_style": gm_b["style"],
            "gm_tendencies": gm_b["tendencies"],
            "sends": [{"name": p.name, "salary": p.salary_millions} for p in side_b.sends],
            "receives": [{"name": p.name, "salary": p.salary_millions} for p in side_a.sends],
            "fit_score": fit_b,
            "fit_reasons": reasons_b,
            "grade": _grade(fit_b),
        },
        "ai_summary": ai_summary,
    }
