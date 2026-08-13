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

from app.routers.clutch_dna import true_shooting_pct
from app.routers.clutch_dna import _fetch_leaderboard as _fetch_clutch_leaderboard
from app.utils.season import get_current_nba_season, get_current_nba_season_start_year

router = APIRouter(prefix="/api/arena", tags=["arena"])

# Computed fresh every process start (see app/utils/season.py) rather than
# hardcoded -- this endpoint is the live current-roster pull, so a stale
# season here means every current-mode game (Wordle, Hint Auction's Current
# era) silently keeps pulling last season's rosters after a season rollover.
SEASON = get_current_nba_season()
CURRENT_SEASON_START_YEAR = get_current_nba_season_start_year()

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


# Hint Auction's 4-tier pool classifier (Elite/Star/Role Player/Deep Bench),
# separate from Wordle's recognition_tier above since the auction needs finer
# granularity to force real budget tradeoffs across a multi-round draft.
# Percentile-ranked rather than absolute-thresholded (see _auction_tier_pass)
# because thresholds tuned by feel would drift as the league's scoring
# environment changes season to season; a percentile cut self-calibrates to
# whatever this season's real distribution looks like.
AUCTION_TIER_PERCENTILE_CUTS = {"Elite": 0.20, "Star": 0.55, "Role Player": 0.85}


def _auction_score(name: str, stats: dict | None, years_in_league: int) -> float:
    if not stats:
        return 40.0 if name in RECENT_ALL_STARS else 0.0
    score = 40.0 if name in RECENT_ALL_STARS else 0.0
    score += stats["pts_pg"] * 2.5
    score += stats["ast_pg"] * 1.5
    score += stats["reb_pg"] * 1.2
    score += stats["stl_pg"] * 4
    score += stats["blk_pg"] * 4
    score += stats["min_pg"] * 0.5
    score += min(years_in_league, 10) * 0.5
    return score


def _auction_tier_pass(players: list[dict[str, Any]]) -> None:
    """Assigns `auction_tier` on every player in place. Requires a second
    pass over the full pool (rather than a per-player threshold like
    _recognition_tier) because percentile bucketing needs the whole
    distribution's sorted order before any single player's tier is knowable.
    """
    ranked = sorted(players, key=lambda p: p["_auction_score"], reverse=True)
    total = len(ranked)
    for i, player in enumerate(ranked):
        percentile = i / total if total else 0
        if percentile < AUCTION_TIER_PERCENTILE_CUTS["Elite"]:
            player["auction_tier"] = "Elite"
        elif percentile < AUCTION_TIER_PERCENTILE_CUTS["Star"]:
            player["auction_tier"] = "Star"
        elif percentile < AUCTION_TIER_PERCENTILE_CUTS["Role Player"]:
            player["auction_tier"] = "Role Player"
        else:
            player["auction_tier"] = "Deep Bench"
        del player["_auction_score"]


# --- Build a Player trait grading ---
#
# 12-bucket percentile scale (95th+ -> A+ ... below 10th -> D-), applied
# identically to every trait once the whole qualified population for that
# trait is known. Computed once per sync (here, not per-request) and
# embedded directly on each player -- see _trait_grade_pass below -- so
# nothing downstream (arena-realtime, the client) ever recomputes a grade.
GRADE_PERCENTILE_CUTS = [
    (0.95, "A+"), (0.90, "A"), (0.85, "A-"), (0.80, "B+"), (0.70, "B"),
    (0.60, "B-"), (0.50, "C+"), (0.40, "C"), (0.30, "C-"), (0.20, "D+"),
    (0.10, "D"),
]


def _grade_for_percentile(percentile: float) -> str:
    for cut, grade in GRADE_PERCENTILE_CUTS:
        if percentile >= cut:
            return grade
    return "D-"


# trait key -> (label, _raw_stats key to read, invert-percentile?). Ball
# Security is the only inverted trait (fewer turnovers = higher grade); every
# other trait grades "higher raw value = higher percentile" directly.
TRAIT_STAT_KEYS: dict[str, tuple[str, str, bool]] = {
    "three_pt": ("3PT Shooting", "fg3_pct", False),
    "mid_range": ("Mid-Range Shooting", "two_pt_pct", False),
    "free_throw": ("Free Throw Shooting", "ft_pct", False),
    "finishing": ("Finishing/Interior Scoring", "fg_pct", False),
    "playmaking": ("Playmaking", "ast_pg", False),
    "ball_security": ("Ball Security", "tov_pg", True),
    "perimeter_defense": ("Perimeter Defense", "stl_pg", False),
    "interior_defense": ("Interior Defense", "blk_pg", False),
    "rebounding": ("Rebounding", "reb_pg", False),
    "durability": ("Durability", "gp", False),
    "efficiency": ("Overall Efficiency", "ts_pct", False),
    "clutch": ("Clutch Performance", "clutch_score", False),
}


def _trait_grade_pass(players: list[dict[str, Any]]) -> None:
    """Assigns `traits` on every player in place. Each trait gets its own
    pass over only the players who actually have a value for it (e.g.
    Clutch Performance's population is just whoever cleared clutch_dna.py's
    own clutch-minutes floor, not the full roster) -- a player missing one
    trait's data shouldn't skew, or be excluded from, another trait's
    percentile ranking. Mirrors _auction_tier_pass's percentile-bucketing
    shape, just run once per trait instead of once overall.
    """
    for player in players:
        player["traits"] = {}

    for trait_key, (label, stat_key, invert) in TRAIT_STAT_KEYS.items():
        qualified = [p for p in players if p["_raw_stats"] and p["_raw_stats"].get(stat_key) is not None]
        if not qualified:
            continue
        ranked = sorted(qualified, key=lambda p: p["_raw_stats"][stat_key])
        total = len(ranked)
        for i, player in enumerate(ranked):
            # i/total (not (i+1)/total) so the single worst qualified player
            # lands at percentile 0.0 rather than a small positive value that
            # could round into the bottom bucket instead of D-.
            percentile = i / total
            if invert:
                percentile = 1 - percentile
            value = player["_raw_stats"][stat_key]
            player["traits"][trait_key] = {
                "label": label,
                "value": round(value, 3) if isinstance(value, float) else value,
                "percentile": round(percentile * 100, 1),
                "grade": _grade_for_percentile(percentile),
            }


def _fetch_clutch_scores() -> dict[int, float]:
    """player_id -> Build a Player's Clutch Performance trait value, reusing
    clutch_dna.py's existing 0-100 clutch score outright rather than
    recomputing anything. _fetch_leaderboard (not the /clutch/leaderboard
    route handler -- that adds its own redundant 1h TTL cache on top) is
    already environment-aware via data_cache.cached_or_live: live locally,
    the committed data_cache/clutch_leaderboard.json snapshot in the cloud,
    where stats.nba.com blocks the request outright. A player absent here
    means "hasn't cleared clutch_dna's own minimum clutch-minutes floor yet,"
    not "graded zero" -- _trait_grade_pass's qualified-population filter
    already excludes them from Clutch Performance's percentile pool rather
    than penalizing them for it.
    """
    try:
        data = _fetch_clutch_leaderboard()
        return {p["player_id"]: p["clutch_score"] for p in data.get("players", [])}
    except Exception:  # noqa: BLE001
        return {}


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
        pts, fga, fta = row[idx["PTS"]], row[idx["FGA"]], row[idx["FTA"]]
        out[player_id] = {
            "pts_pg": round(row[idx["PTS"]] / gp, 1),
            "ast_pg": round(row[idx["AST"]] / gp, 1),
            "reb_pg": round(row[idx["REB"]] / gp, 1),
            "stl_pg": round(row[idx["STL"]] / gp, 1),
            "blk_pg": round(row[idx["BLK"]] / gp, 1),
            "fg3a_pg": round(row[idx["FG3A"]] / gp, 1),
            "min_pg": round(row[idx["MIN"]] / gp, 1),
            # Everything below is for Build a Player's trait grading
            # (_trait_grade_pass) -- raw totals/percentages straight off the
            # same Base dashboard response the fields above already come
            # from, so none of this costs another API round trip.
            "gp": gp,
            "fg_pct": row[idx["FG_PCT"]],
            "fg3_pct": row[idx["FG3_PCT"]],
            "ft_pct": row[idx["FT_PCT"]],
            "fgm": row[idx["FGM"]],
            "fga": fga,
            "fg3m": row[idx["FG3M"]],
            "fg3a": row[idx["FG3A"]],
            "tov_pg": round(row[idx["TOV"]] / gp, 1),
            "ts_pct": true_shooting_pct(pts, fga, fta),
            # Mid-Range Shooting's real-stat proxy: nba_api's Base dashboard
            # has no zone breakdown, so this backs out overall 2-point FG%
            # from the totals it does have (2PM = FGM-FG3M, 2PA = FGA-FG3A)
            # rather than pulling a real "jumpers only" split. None (not 0)
            # for the rare all-three-point-attempts case, so a 0-for-0 split
            # isn't graded as a 0% shooter.
            "two_pt_pct": (
                (row[idx["FGM"]] - row[idx["FG3M"]]) / (fga - row[idx["FG3A"]])
                if (fga - row[idx["FG3A"]]) > 0
                else None
            ),
        }
    return out


def fetch_current_players() -> list[dict[str, Any]]:
    all_teams = static_teams.get_teams()

    try:
        stats_by_id = _fetch_stats_by_player_id()
    except Exception:  # noqa: BLE001
        stats_by_id = {}

    # _fetch_clutch_scores handles its own failure internally (empty dict on
    # error) -- a clutch-pull failure should cost the Clutch Performance
    # trait alone, not the whole sync, same isolate-the-failure shape as the
    # try/except right above it.
    clutch_by_id = _fetch_clutch_scores()

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
                # Real per-game stats, surfaced for Hint Auction's hints and
                # post-auction reveal (Wordle, the endpoint's original
                # consumer, never needed them — recognition_tier/style_tag
                # above already summarize `stats` without exposing it raw).
                # None rather than 0 for players with no confirmed minutes,
                # so a client can't mistake "no data" for "scored zero".
                "pts_pg": stats["pts_pg"] if stats else None,
                "ast_pg": stats["ast_pg"] if stats else None,
                "reb_pg": stats["reb_pg"] if stats else None,
                "stl_pg": stats["stl_pg"] if stats else None,
                "blk_pg": stats["blk_pg"] if stats else None,
                "_auction_score": _auction_score(name, stats, years_in_league),
                # Internal-only, consumed by _trait_grade_pass and deleted
                # below -- same shape as _auction_score above. clutch_score
                # is merged in here (rather than left as a separate lookup)
                # so _trait_grade_pass can treat every trait identically,
                # one dict of raw values per player.
                "_raw_stats": {**stats, "clutch_score": clutch_by_id.get(player_id)} if stats else None,
            })

    _auction_tier_pass(players)
    _trait_grade_pass(players)
    for player in players:
        del player["_raw_stats"]
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
