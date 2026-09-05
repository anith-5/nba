"""
Head-to-head player-season comparison data layer.

Builds three comparison cards for TWO chosen player-seasons (each side picks
its own player AND its own year, so cross-era matchups like 2012-13 LeBron vs
1990-91 Jordan work):

  1. Stat comp     — the same six box-stat radar axes the Draft Prospect Comps
                     card uses, so the two features read identically.
  2. Accolades     — ONLY the awards that player won in that specific season,
                     listed under their name, with every team they suited up
                     for that year (in order, so a mid-season trade shows both).
  3. Efficiency    — the same hexbin shot chart as the draft comp, one court
                     per player, with a delta bar underneath naming whichever
                     player shot the higher field-goal percentage.

All three are real NBA data (playercareerstats / playerawards /
shotchartdetail). A card with no source data is reported unavailable rather
than fabricated — matching how draft_comp.py degrades.

NETWORK NOTE: stats.nba.com blocks cloud IPs, so — exactly like the Shot
Quality endpoints — these calls succeed locally and fail gracefully when
deployed. Everything fetched is written to data_cache/ on the way through, so
a season that has been looked at once is served from disk afterwards.
"""

from __future__ import annotations

import logging
import time
from typing import Optional

from nba_api.stats.endpoints import playerawards, playercareerstats, shotchartdetail
from nba_api.stats.static import players as static_players

from app import data_cache
from app.config import settings

logger = logging.getLogger(__name__)

# Between NBA calls. Same courtesy delay the shot-quality router uses.
_NBA_DELAY = 0.7

# NBA.com only has shot coordinates from 1996-97 on. Older seasons return an
# empty frame rather than an error, so the efficiency card has to check the
# season itself to tell "no tracking existed" apart from "the fetch failed".
SHOT_DATA_FIRST_SEASON = "1996-97"

# Distance from the baseline to the centre of the hoop, in feet — used to move
# NBA shot coords onto the baseline-relative axis components/ShotChart.jsx
# draws against. Same constant, same reason, as routers/shot_quality.py.
HOOP_FROM_BASELINE_FT = 5.25

# The six radar axes, in display order. Deliberately identical to
# draft_comp.RADAR_AXES so both features plot the same hexagon.
RADAR_AXES = ["scoring", "efficiency", "playmaking", "rebounding", "defense", "shooting"]


# ─────────────────────────────────────────────────────────────────────────────
# Cache helper
# ─────────────────────────────────────────────────────────────────────────────

# How long a snapshot that can still change is trusted before being refetched.
# Only in-progress data is subject to it, so this costs at most one NBA call
# per player (or current-season shot chart) per window.
_LIVE_TTL_SECONDS = 12 * 3600


def _stale(name: str) -> bool:
    """Has the cached file aged past the live-data TTL? Missing counts as stale."""
    try:
        return (time.time() - (data_cache.CACHE_DIR / name).stat().st_mtime) > _LIVE_TTL_SECONDS
    except OSError:
        return True


def _cached(name: str, fetch, volatile: bool = False):
    """Read `name` from data_cache, else fetch live and write it through.

    Unlike data_cache.cached_or_live (live-first locally, for data that goes
    stale), a COMPLETED player-season never changes — so once it is on disk
    there is no reason to call NBA about it again, ever.

    `volatile` marks the data that can still move: anything covering the season
    now being played. Those entries are re-fetched once the TTL above expires;
    if that re-fetch fails (NBA unreachable, or blocked on the cloud) the stale
    copy is served rather than nothing, since slightly old beats an error page.
    """
    hit = data_cache.read_json(name)
    if hit is not None and not (volatile and _stale(name)):
        return hit

    try:
        data = fetch()
    except Exception:
        if hit is not None:
            logger.warning("head-to-head: refresh of %s failed, serving stale copy", name)
            return hit
        raise

    if data is None:
        return hit  # a failed/empty refresh must not discard what we already had
    try:
        data_cache.write_json(name, data)
    except OSError:  # read-only disk on some hosts — serving still works
        logger.warning("head-to-head: could not cache %s", name)
    return data


def _season_start_year(season: str) -> int:
    """'1996-97' -> 1996. Used for ordering and the shot-data cutoff."""
    try:
        return int(str(season).split("-")[0])
    except (ValueError, AttributeError):
        return 0


def season_has_shot_data(season: str) -> bool:
    return _season_start_year(season) >= _season_start_year(SHOT_DATA_FIRST_SEASON)


# ─────────────────────────────────────────────────────────────────────────────
# Player search — the all-time roster, not just actives
# ─────────────────────────────────────────────────────────────────────────────

def search_players(query: str, limit: int = 20) -> list[dict]:
    """Name search across every player in NBA history.

    Ranked so a typed prefix beats a mid-name substring ("james" surfaces
    James Harden before LeBron James), and actives beat retired players at
    equal rank — otherwise a common surname buries the player being looked for
    under a century of namesakes.
    """
    q = query.strip().lower()
    if not q:
        return []

    scored = []
    for p in static_players.get_players():
        full = (p.get("full_name") or "").lower()
        if q not in full:
            continue
        last = (p.get("last_name") or "").lower()
        if full == q:
            rank = 0
        elif last.startswith(q):
            rank = 1
        elif full.startswith(q):
            rank = 2
        else:
            rank = 3
        scored.append((rank, 0 if p.get("is_active") else 1, full, p))

    scored.sort(key=lambda s: s[:3])
    return [
        {"id": p["id"], "name": p["full_name"], "is_active": bool(p.get("is_active"))}
        for *_, p in scored[:limit]
    ]


# ─────────────────────────────────────────────────────────────────────────────
# Career seasons
# ─────────────────────────────────────────────────────────────────────────────

def _career_rows(player_id: int) -> list[dict]:
    """Every regular-season row for a player, cached.

    NBA returns ONE row per team per season plus, for a player who was traded,
    an extra 'TOT' row (TEAM_ID 0) holding the combined line. Both shapes are
    kept here; the callers below pick whichever they need.
    """
    def fetch():
        time.sleep(_NBA_DELAY)
        payload = playercareerstats.PlayerCareerStats(player_id=player_id, timeout=60).get_dict()
        for rs in payload.get("resultSets") or []:
            if rs.get("name") == "SeasonTotalsRegularSeason":
                headers = rs.get("headers") or []
                return [dict(zip(headers, row, strict=False)) for row in rs.get("rowSet") or []]
        return []

    # Volatile: an active player gains rows (and games) all through the season.
    return _cached(f"h2h_career_{player_id}.json", fetch, volatile=True) or []


def _is_total_row(row: dict) -> bool:
    return row.get("TEAM_ABBREVIATION") == "TOT" or row.get("TEAM_ID") in (0, "0")


def player_seasons(player_id: int) -> dict:
    """Season picker payload: every year this player played, newest first.

    `teams` lists each stop that season in the order NBA returns them, so a
    trade reads CLE → LAL rather than collapsing to the meaningless 'TOT'.
    """
    grouped: dict[str, list[dict]] = {}
    for row in _career_rows(player_id):
        season = row.get("SEASON_ID")
        if season:
            grouped.setdefault(season, []).append(row)

    seasons = []
    for season, rows in grouped.items():
        total = next((r for r in rows if _is_total_row(r)), None)
        team_rows = [r for r in rows if not _is_total_row(r)]
        teams = []
        for r in team_rows:
            abbr = r.get("TEAM_ABBREVIATION")
            if abbr and abbr not in teams:
                teams.append(abbr)
        # For a traded season the TOT row is the authoritative games-played;
        # summing the per-team rows as well would double-count it.
        gp = int((total or {}).get("GP") or 0) if total else sum(int(r.get("GP") or 0) for r in team_rows)
        seasons.append({
            "season": season,
            "teams": teams,
            "gp": gp,
            "age": (total or rows[0]).get("PLAYER_AGE"),
            "has_shot_data": season_has_shot_data(season),
        })

    seasons.sort(key=lambda s: _season_start_year(s["season"]), reverse=True)

    name = next((p["full_name"] for p in static_players.get_players() if p["id"] == player_id), None)
    return {"player_id": player_id, "name": name, "seasons": seasons}


# ─────────────────────────────────────────────────────────────────────────────
# Card 1 — stat radar (same six axes as the draft comp)
# ─────────────────────────────────────────────────────────────────────────────

def _f(row: dict, key: str) -> Optional[float]:
    v = row.get(key)
    if v in (None, ""):
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _per_game(row: dict, key: str, gp: float) -> Optional[float]:
    v = _f(row, key)
    return round(v / gp, 1) if v is not None and gp else None


def season_line(player_id: int, season: str) -> Optional[dict]:
    """One player-season's radar values plus the teams played for that year.

    For a traded season the TOT row supplies the stats (it is the player's
    actual full-year line) while the per-team rows supply the team list.
    """
    rows = [r for r in _career_rows(player_id) if r.get("SEASON_ID") == season]
    if not rows:
        return None

    stat_row = next((r for r in rows if _is_total_row(r)), rows[0])
    teams = [r["TEAM_ABBREVIATION"] for r in rows if not _is_total_row(r) and r.get("TEAM_ABBREVIATION")]

    gp = _f(stat_row, "GP") or 0.0
    pts, fga, fta = _f(stat_row, "PTS"), _f(stat_row, "FGA"), _f(stat_row, "FTA")

    # True shooting: points per shooting possession, where the 0.44 weight is
    # the league's standard estimate of trips that end at the line.
    ts = None
    if pts is not None and fga is not None:
        denom = 2 * (fga + 0.44 * (fta or 0.0))
        if denom:
            ts = round(pts / denom, 3)

    stl, blk = _f(stat_row, "STL"), _f(stat_row, "BLK")
    # Steals and blocks were not recorded before 1973-74; leave the axis empty
    # rather than reporting a real zero for a stat nobody was keeping.
    defense = round((stl + blk) / gp, 1) if (stl is not None and blk is not None and gp) else None

    return {
        "player_id": player_id,
        "season": season,
        "teams": teams,
        "gp": int(gp),
        "age": stat_row.get("PLAYER_AGE"),
        "radar": {
            "scoring": _per_game(stat_row, "PTS", gp),        # PPG
            "efficiency": ts,                                  # TS%
            "playmaking": _per_game(stat_row, "AST", gp),      # APG
            "rebounding": _per_game(stat_row, "REB", gp),      # RPG
            "defense": defense,                                # STL+BLK
            "shooting": _f(stat_row, "FG3_PCT"),               # 3P%
        },
    }


# Normalization scales for the six axes, so the similarity score weights each
# axis comparably. NBA ranges, not the college ones in draft_comp — a 25 PPG
# scorer is the ceiling in both leagues, but NBA assist and rebound rates for
# an elite season run higher than a college guard's.
_RADAR_SCALE = {
    "scoring": 30.0,      # PPG
    "efficiency": 0.65,   # TS%
    "playmaking": 10.0,   # APG
    "rebounding": 13.0,   # RPG
    "defense": 4.0,       # STL+BLK
    "shooting": 0.45,     # 3P%
}


def radar_similarity(a: dict, b: dict) -> float:
    """0–100 similarity between two radar dicts (higher = more alike)."""
    diffs = []
    for axis in RADAR_AXES:
        va, vb = a.get(axis), b.get(axis)
        if va is None or vb is None:
            continue
        diffs.append(((va - vb) / _RADAR_SCALE[axis]) ** 2)
    if not diffs:
        return 0.0
    dist = (sum(diffs) / len(diffs)) ** 0.5  # normalized RMS distance
    return round(max(0.0, 100.0 * (1.0 - dist)))


# ─────────────────────────────────────────────────────────────────────────────
# Card 2 — accolades won IN that season
# ─────────────────────────────────────────────────────────────────────────────

# Display order, most prestigious first. Matched as a prefix against the award
# DESCRIPTION, so "NBA Most Valuable Player" is caught without also swallowing
# "NBA All-Star Most Valuable Player" (which is listed separately, and earlier
# in the list, because the first match wins).
_AWARD_ORDER = [
    "NBA Champion",
    "NBA Finals Most Valuable Player",
    "NBA Most Valuable Player",
    "NBA Sporting News Most Valuable Player",
    "NBA Defensive Player of the Year",
    "NBA Rookie of the Year",
    "NBA Sporting News Rookie of the Year",
    "NBA Sixth Man of the Year",
    "NBA Most Improved Player",
    "NBA Sportsmanship",
    # Stems, not full descriptions: the team-number rewrite above turns
    # "All-Defensive Team" into "All-Defensive First Team", which a full-name
    # prefix would no longer match — dropping the award to the bottom.
    "All-NBA",
    "All-Defensive",
    "All-Rookie",
    "NBA All-Star Most Valuable Player",
    "NBA All-Star",
    "NBA Cup Most Valuable Player",
    "NBA Cup All-Tournament Team",
    "NBA Player of the Month",
    "NBA Rookie of the Month",
    "NBA Player of the Week",
    "NBA Rookie of the Week",
    "Olympic Gold Medal",
    "Olympic Silver Medal",
    "Olympic Bronze Medal",
]

# The "team number" awards read as ordinals on the card, not bare digits.
_TEAM_NUMBER_NAMES = {"1": "First", "2": "Second", "3": "Third"}

# Awards handed out repeatedly within one season. These are collapsed to a
# single line with a count ("NBA Player of the Week ×6") — six identical rows
# would bury the season awards they sit under.
_REPEATABLE = ("NBA Player of the Week", "NBA Player of the Month",
               "NBA Rookie of the Week", "NBA Rookie of the Month")


def _award_rank(label: str) -> int:
    for i, prefix in enumerate(_AWARD_ORDER):
        if label.startswith(prefix):
            return i
    return len(_AWARD_ORDER)


def _award_rows(player_id: int) -> list[dict]:
    """Every award this player has ever won, cached."""
    def fetch():
        time.sleep(_NBA_DELAY)
        payload = playerawards.PlayerAwards(player_id=player_id, timeout=60).get_dict()
        for rs in payload.get("resultSets") or []:
            if rs.get("rowSet") is not None and rs.get("headers"):
                headers = rs["headers"]
                return [dict(zip(headers, row, strict=False)) for row in rs["rowSet"]]
        return []

    try:
        # Volatile: awards accrue in-season (player of the week, and so on).
        return _cached(f"h2h_awards_{player_id}.json", fetch, volatile=True) or []
    except Exception as exc:  # noqa: BLE001 — a player with no awards page
        logger.info("head-to-head: no awards for %s (%s)", player_id, exc)
        return []


def season_accolades(player_id: int, season: str) -> list[dict]:
    """Awards this player won in THIS season only, most prestigious first."""
    counts: dict[str, int] = {}
    for row in _award_rows(player_id):
        if row.get("SEASON") != season:
            continue
        desc = (row.get("DESCRIPTION") or "").strip()
        if not desc:
            continue
        # All-NBA / All-Defensive / All-Rookie carry the team number separately.
        # The ordinal goes where the word "Team" already is, so "All-Defensive
        # Team" + 1 reads "All-Defensive First Team", not "…Team First Team".
        num = str(row.get("ALL_NBA_TEAM_NUMBER") or "").strip()
        label = desc
        if num in _TEAM_NUMBER_NAMES:
            stem = desc[: -len(" Team")] if desc.endswith(" Team") else desc
            label = f"{stem} {_TEAM_NUMBER_NAMES[num]} Team"
        counts[label] = counts.get(label, 0) + 1

    out = []
    for label, n in counts.items():
        # Only the weekly/monthly awards are legitimately repeatable. A
        # duplicate anywhere else is an NBA data artifact, so it is shown once.
        repeats = n if label.startswith(_REPEATABLE) else 1
        out.append({"label": label, "count": repeats})
    out.sort(key=lambda a: (_award_rank(a["label"]), a["label"]))
    return out


# ─────────────────────────────────────────────────────────────────────────────
# Card 3 — efficiency (shot chart + FG% delta)
# ─────────────────────────────────────────────────────────────────────────────

def season_shots(player_id: int, season: str) -> Optional[dict]:
    """Every field-goal attempt in a season, in the shared court space.

    Returns None when the season predates shot tracking (pre-1996-97) or the
    fetch turned up nothing, so the caller can mark the card unavailable.
    """
    if not season_has_shot_data(season):
        return None

    def fetch():
        time.sleep(_NBA_DELAY)
        chart = shotchartdetail.ShotChartDetail(
            player_id=player_id,
            team_id=0,
            game_id_nullable="",
            season_nullable=season,
            season_type_all_star="Regular Season",
            context_measure_simple="FGA",
            timeout=120,
        )
        df = chart.get_data_frames()[0]
        if df.empty:
            return None

        # ShotChartDetail gives LOC_X/LOC_Y in TENTHS of a foot from the CENTRE
        # of the hoop; components/ShotChart.jsx wants x 0–50 across the width
        # and y in feet from the baseline. Same conversion as shot_quality.py.
        shots, made = [], 0
        for x10, y10, flag, shot_type in zip(
            df["LOC_X"], df["LOC_Y"], df["SHOT_MADE_FLAG"], df["SHOT_TYPE"],
        ):
            x = 25.0 + float(x10) / 10.0
            y = HOOP_FROM_BASELINE_FT + float(y10) / 10.0
            made += int(flag)
            # Drop backcourt heaves: they carry real coordinates but would
            # stretch the bin scale until every in-rhythm shot is one blob.
            if not (0.0 <= x <= 50.0) or not (0.0 <= y <= 47.0):
                continue
            shots.append({
                "x": round(x, 1),
                "y": round(y, 1),
                "made": int(flag),
                "value": 3 if "3PT" in str(shot_type) else 2,
            })

        attempts = int(len(df))
        return {
            "shots": shots,
            "made": made,
            "attempts": attempts,
            "fg_pct": round(made / attempts, 3) if attempts else 0.0,
        }

    try:
        return _cached(f"h2h_shots_{player_id}_{season}.json", fetch,
                       volatile=season == settings.current_season)
    except Exception as exc:  # noqa: BLE001 — blocked/timed-out NBA call
        logger.info("head-to-head: no shots for %s %s (%s)", player_id, season, exc)
        return None


# ─────────────────────────────────────────────────────────────────────────────
# Assembly — the three cards for one matchup
# ─────────────────────────────────────────────────────────────────────────────

def _side(player_id: int, season: str) -> dict:
    name = next((p["full_name"] for p in static_players.get_players() if p["id"] == player_id), None)
    line = season_line(player_id, season)
    return {
        "player_id": player_id,
        "name": name or f"Player {player_id}",
        "season": season,
        "line": line,
        "accolades": season_accolades(player_id, season),
        "shots": season_shots(player_id, season),
    }


def build_comparison(a_id: int, a_season: str, b_id: int, b_season: str) -> dict:
    """The three head-to-head cards for two player-seasons.

    Each card is independently None-able: a season with no box score, no
    awards, or no shot tracking degrades to an unavailable card instead of
    taking the whole comparison down.
    """
    a, b = _side(a_id, a_season), _side(b_id, b_season)

    def meta(side):
        line = side["line"] or {}
        return {
            "player_id": side["player_id"], "name": side["name"], "season": side["season"],
            "teams": line.get("teams", []), "gp": line.get("gp"), "age": line.get("age"),
        }

    # Card 1 — stat radar. Needs a box line on BOTH sides: a one-sided hexagon
    # is not a comparison.
    stats = None
    if a["line"] and b["line"]:
        stats = {
            "a": {**meta(a), "radar": a["line"]["radar"]},
            "b": {**meta(b), "radar": b["line"]["radar"]},
            "match": radar_similarity(a["line"]["radar"], b["line"]["radar"]),
        }

    # Card 2 — accolades. Always shown: "no accolades this season" is itself a
    # real, informative answer, unlike a missing stat line.
    accolades = {
        "a": {**meta(a), "awards": a["accolades"]},
        "b": {**meta(b), "awards": b["accolades"]},
    }

    # Card 3 — efficiency. Both courts render identically; the delta bar under
    # them names whoever shot the higher field-goal percentage.
    efficiency = None
    if a["shots"] and b["shots"]:
        a_pct, b_pct = a["shots"]["fg_pct"], b["shots"]["fg_pct"]
        efficiency = {
            "a": {**meta(a), **a["shots"]},
            "b": {**meta(b), **b["shots"]},
            "delta": round(abs(a_pct - b_pct), 3),
            "leader": None if a_pct == b_pct else ("a" if a_pct > b_pct else "b"),
        }

    return {
        "a": meta(a),
        "b": meta(b),
        "cards": {"stats": stats, "accolades": accolades, "efficiency": efficiency},
        # Lets the UI say WHY the efficiency card is missing rather than giving
        # the same "no data" line to a 1962 season and a failed fetch.
        "shot_data_available": {
            "a": season_has_shot_data(a_season),
            "b": season_has_shot_data(b_season),
        },
    }
