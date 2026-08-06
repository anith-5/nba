"""Live current-roster data for HoopIQ Arena's NBA Wordle game mode.

Pulls every team's current roster from nba_api on each request rather than
storing roster data in this repo — rosters change via trades/signings/waivers
constantly, so nothing here is hardcoded. The Node arena-realtime server is
responsible for caching this response (see
services/arena-realtime/src/data/rosterSync.js); this router always does a
live pull when called.
"""

from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter
from nba_api.stats.endpoints import commonteamroster, leaguedashplayerstats
from nba_api.stats.static import teams as static_teams

router = APIRouter(prefix="/api/arena", tags=["arena"])

SEASON = "2025-26"
CURRENT_SEASON_START_YEAR = 2025

# Conference/division is stable franchise metadata (not roster data), so it's
# fine to keep as a lookup table here rather than deriving it per-request.
TEAM_CONFERENCE_DIVISION: dict[str, tuple[str, str]] = {
    "ATL": ("East", "Southeast"), "BOS": ("East", "Atlantic"), "BKN": ("East", "Atlantic"),
    "CHA": ("East", "Southeast"), "CHI": ("East", "Central"), "CLE": ("East", "Central"),
    "DAL": ("West", "Southwest"), "DEN": ("West", "Northwest"), "DET": ("East", "Central"),
    "GSW": ("West", "Pacific"), "HOU": ("West", "Southwest"), "IND": ("East", "Central"),
    "LAC": ("West", "Pacific"), "LAL": ("West", "Pacific"), "MEM": ("West", "Southwest"),
    "MIA": ("East", "Southeast"), "MIL": ("East", "Central"), "MIN": ("West", "Northwest"),
    "NOP": ("West", "Southwest"), "NYK": ("East", "Atlantic"), "OKC": ("West", "Northwest"),
    "ORL": ("East", "Southeast"), "PHI": ("East", "Atlantic"), "PHX": ("West", "Pacific"),
    "POR": ("West", "Northwest"), "SAC": ("West", "Pacific"), "SAS": ("West", "Southwest"),
    "TOR": ("East", "Atlantic"), "UTA": ("West", "Northwest"), "WAS": ("East", "Southeast"),
}

# nba_api's bulk roster/stats endpoints don't expose "made an All-Star team in
# the last 3 seasons" directly, and pulling per-player history for ~500
# players would mean 500+ sequential API calls. This supplementary list of
# 2023-2025 All-Stars (real rosters) lets recognition_tier catch players
# whose current-season scoring dipped but who are still household names.
RECENT_ALL_STARS = {
    "LeBron James", "Kevin Durant", "Giannis Antetokounmpo", "Stephen Curry", "Nikola Jokic",
    "Luka Doncic", "Ja Morant", "Zion Williamson", "Shai Gilgeous-Alexander", "Damian Lillard",
    "Donovan Mitchell", "DeMar DeRozan", "Jimmy Butler", "Joel Embiid", "Jayson Tatum",
    "Kyrie Irving", "Jaylen Brown", "Julius Randle", "Domantas Sabonis", "De'Aaron Fox",
    "Lauri Markkanen", "Paul George", "Anthony Davis", "Bam Adebayo", "Tyrese Haliburton",
    "Pascal Siakam", "Jalen Brunson", "Devin Booker", "Anthony Edwards", "Karl-Anthony Towns",
    "Trae Young", "Scottie Barnes", "James Harden", "Cade Cunningham", "Paolo Banchero",
    "Alperen Sengun", "Evan Mobley", "Darius Garland",
}


def _retry(fn, attempts: int = 2, delay: float = 0.5):
    last_err: Exception | None = None
    for i in range(attempts):
        try:
            return fn()
        except Exception as exc:  # noqa: BLE001
            last_err = exc
            if i < attempts - 1:
                time.sleep(delay)
    raise last_err  # type: ignore[misc]


def _era_label(debut_year: int) -> str:
    if debut_year < 1980:
        return "Classic Era"
    if debut_year <= 1989:
        return "Showtime Era"
    if debut_year <= 1999:
        return "Jordan Era"
    if debut_year <= 2009:
        return "Early 2000s"
    if debut_year <= 2019:
        return "Analytics Era"
    return "Modern Era"


def _parse_height(height_str: str) -> tuple[int, int, int]:
    """'6-6' -> (feet=6, inches=6, total_inches=78)."""
    try:
        feet_s, inches_s = str(height_str).split("-")
        feet, inches = int(feet_s), int(inches_s)
        return feet, inches, feet * 12 + inches
    except (ValueError, AttributeError):
        return 6, 6, 78


def _refine_position(raw_position: str, stats: dict | None, height_in: int) -> str:
    """nba_api's roster/player-info endpoints only expose coarse Guard/
    Forward/Center (sometimes hybrid 'Guard-Forward') labels, not the PG/SG/
    SF/PF/C granularity Wordle's Position tile needs. This derives the
    specific position from that coarse label plus real per-game stats
    (assist rate to split G into PG/SG, rebound rate + height to split F into
    SF/PF) rather than guessing blind — still real API-sourced data, just a
    best-effort classification layered on top.
    """
    # commonteamroster's POSITION field uses abbreviated codes like "G",
    # "F", "C", "G-F", "F-C" — not full words (commonplayerinfo uses full
    # words like "Guard", but that's a different endpoint). Split on "-" so
    # both single and hybrid codes are handled the same way.
    parts = (raw_position or "").upper().split("-")
    is_guard = "G" in parts
    is_forward = "F" in parts
    is_center = "C" in parts
    ast_pg = stats["ast_pg"] if stats else 0
    reb_pg = stats["reb_pg"] if stats else 0

    if is_guard and is_forward:
        return "SF" if height_in >= 79 else "SG"
    if is_forward and is_center:
        return "PF"
    if is_guard:
        return "PG" if ast_pg >= 4.5 else "SG"
    if is_forward:
        return "PF" if height_in >= 81 or reb_pg >= 7 else "SF"
    if is_center:
        return "C"
    return "SF"


def _style_tag(position: str, stats: dict | None) -> str:
    if not stats:
        return {
            "PG": "Floor General", "SG": "Scoring Guard", "SF": "Wing Scorer",
            "PF": "Stretch Big", "C": "Interior Anchor",
        }.get(position, "Wing Scorer")

    pts, ast, reb = stats["pts_pg"], stats["ast_pg"], stats["reb_pg"]
    stl, blk, fg3a = stats["stl_pg"], stats["blk_pg"], stats["fg3a_pg"]

    if pts >= 20 and (stl + blk) >= 1.8:
        return "Two Way Star"

    if position == "PG":
        return "Floor General" if ast >= 6 else "Scoring Guard"
    if position == "SG":
        return "3 and D" if fg3a >= 5 and stl >= 1.0 and pts < 16 else "Scoring Guard"
    if position == "SF":
        return "3 and D" if fg3a >= 4.5 and pts < 14 else "Wing Scorer"
    if position == "PF":
        if ast >= 4:
            return "Playmaking Big"
        return "Stretch Big" if fg3a >= 3 or reb < 7 else "Interior Anchor"
    if position == "C":
        if ast >= 4:
            return "Playmaking Big"
        return "Stretch Big" if fg3a >= 2.5 else "Interior Anchor"
    return "Wing Scorer"


def _recognition_tier(name: str, stats: dict | None) -> str:
    if name in RECENT_ALL_STARS:
        return "Star"
    if not stats:
        return "Deep Cut"
    if stats["pts_pg"] >= 15:
        return "Star"
    if stats["pts_pg"] >= 8 or stats["min_pg"] >= 24:
        return "Role Player"
    return "Deep Cut"


def _fetch_stats_by_player_id() -> dict[int, dict]:
    result = _retry(lambda: leaguedashplayerstats.LeagueDashPlayerStats(season=SEASON, timeout=30))
    result_dict = result.get_dict()
    result_set = result_dict["resultSets"][0]
    headers = result_set["headers"]
    idx = {h: i for i, h in enumerate(headers)}
    out: dict[int, dict] = {}
    for row in result_set["rowSet"]:
        gp = row[idx["GP"]] or 0
        if not gp:
            continue
        player_id = row[idx["PLAYER_ID"]]
        out[player_id] = {
            "pts_pg": round(row[idx["PTS"]] / gp, 1),
            "ast_pg": round(row[idx["AST"]] / gp, 1),
            "reb_pg": round(row[idx["REB"]] / gp, 1),
            "stl_pg": round(row[idx["STL"]] / gp, 1),
            "blk_pg": round(row[idx["BLK"]] / gp, 1),
            "fg3a_pg": round(row[idx["FG3A"]] / gp, 1),
            "min_pg": round(row[idx["MIN"]] / gp, 1),
        }
    return out


def fetch_current_players() -> list[dict[str, Any]]:
    all_teams = static_teams.get_teams()

    try:
        stats_by_id = _fetch_stats_by_player_id()
    except Exception:  # noqa: BLE001
        stats_by_id = {}

    players: list[dict[str, Any]] = []
    for team in all_teams:
        abbr = team["abbreviation"]
        conference, division = TEAM_CONFERENCE_DIVISION.get(abbr, ("East", "Atlantic"))

        try:
            roster = _retry(
                lambda: commonteamroster.CommonTeamRoster(team_id=team["id"], season=SEASON, timeout=30),
                attempts=3,
                delay=1.0,
            )
            result_set = roster.get_dict()["resultSets"][0]
            headers = result_set["headers"]
            idx = {h: i for i, h in enumerate(headers)}
            rows = result_set["rowSet"]
        except Exception:  # noqa: BLE001
            continue  # skip this team rather than fail the whole sync
        time.sleep(0.2)  # be gentle on stats.nba.com across 30 sequential calls

        for row in rows:
            player_id = row[idx["PLAYER_ID"]]
            name = row[idx["PLAYER"]]
            feet, inches, total_in = _parse_height(row[idx["HEIGHT"]])

            weight_raw = row[idx["WEIGHT"]]
            weight = int(weight_raw) if str(weight_raw).isdigit() else None

            exp_raw = str(row[idx["EXP"]]).strip().upper()
            years_in_league = 0 if exp_raw in ("R", "") else int(exp_raw)
            debut_year = CURRENT_SEASON_START_YEAR - years_in_league

            jersey_raw = row[idx["NUM"]]
            jersey_number = int(jersey_raw) if str(jersey_raw).isdigit() else None

            age_raw = row[idx["AGE"]]
            age = int(round(age_raw)) if age_raw else None

            stats = stats_by_id.get(player_id)
            position = _refine_position(row[idx["POSITION"]], stats, total_in)

            players.append({
                "name": name,
                "player_id": player_id,
                "team_full_name": team["full_name"],
                "team_abbreviation": abbr,
                "conference": conference,
                "division": division,
                "position": position,
                "height_feet": feet,
                "height_inches": inches,
                "height_total_inches": total_in,
                "weight": weight,
                "jersey_number": jersey_number,
                "age": age,
                "years_in_league": years_in_league,
                # Birth country isn't in the bulk roster/stats endpoints —
                # only per-player commonplayerinfo, which would mean 450+
                # sequential calls per sync. Left null rather than making
                # this endpoint take several minutes and risk rate-limiting.
                "country": None,
                "era_label": _era_label(debut_year),
                "style_tag": _style_tag(position, stats),
                "recognition_tier": _recognition_tier(name, stats),
            })

    return players


def _envelope(players: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": "live",
        "season": SEASON,
        "count": len(players),
        "players": players,
    }


@router.get("/current-players")
def get_current_players():
    return _envelope(fetch_current_players())


@router.post("/sync-rosters")
def sync_rosters():
    return _envelope(fetch_current_players())
