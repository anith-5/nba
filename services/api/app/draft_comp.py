"""
Draft prospect comparison data layer.

Builds three grounded comparison cards for a college prospect:
  1. Radar stat comp   — 6 box-stat axes vs. an NBA player's OWN college line
  2. Shot chart comp    — real hexbin from ESPN college play-by-play vs. NBA shots
  3. Combine comp       — anthropometrics + NBA-guard percentiles (BBRef combine)

All three use REAL data only. Where a source doesn't cover a player
(e.g. international prospects have no ESPN/CBB/combine data), the card is
reported unavailable rather than fabricated.

This module is the data/similarity layer; a router exposes it and a
precompute step caches the (rate-limited) scrapes at build time.
"""

from __future__ import annotations

import re
import time
from typing import Optional

import requests
import lxml.html as H
from nba_api.stats.endpoints import draftcombinestats

# ─────────────────────────────────────────────────────────────────────────────
# HTTP
# ─────────────────────────────────────────────────────────────────────────────

_UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
       "(KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36")
_SR_HEADERS = {
    "User-Agent": _UA,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.google.com/",
}
_SR_DELAY = 1.5  # sports-reference jails ~20 req/min — stay well under


def _sr_get(url: str) -> Optional[str]:
    """GET a sports-reference page; return HTML with commented tables un-hidden."""
    r = requests.get(url, headers=_SR_HEADERS, timeout=25)
    if r.status_code != 200:
        return None
    # sports-reference buries many tables inside HTML comments to deter scrapers
    return r.text.replace("<!--", "").replace("-->", "")


# ─────────────────────────────────────────────────────────────────────────────
# College box stats (sports-reference CBB)
# ─────────────────────────────────────────────────────────────────────────────

# The six radar axes, in display order (matches the mockup card).
RADAR_AXES = ["scoring", "efficiency", "playmaking", "rebounding", "defense", "shooting"]


def _cell(tr, stat: str) -> Optional[str]:
    td = tr.xpath(f"./*[@data-stat='{stat}']")
    return td[0].text_content().strip() if td else None


def _num(v) -> Optional[float]:
    if v in (None, ""):
        return None
    try:
        return float(v)
    except ValueError:
        return None


def _resolve_cbb_url(name: str) -> Optional[str]:
    """Resolve a player NAME to their sports-reference CBB page URL.

    The search redirects straight to the page for a unique name; otherwise it
    returns a results page and we take the first CBB player link.
    """
    try:
        r = requests.get(
            f"https://www.sports-reference.com/cbb/search/search.fcgi?search={name.replace(' ', '+')}",
            headers=_SR_HEADERS, timeout=25, allow_redirects=True,
        )
    except Exception:
        return None
    if "/cbb/players/" in r.url:
        return r.url
    doc = H.fromstring(r.text)
    hrefs = (doc.xpath("//div[@id='players']//a[contains(@href,'/cbb/players/')]/@href")
             or doc.xpath("//a[contains(@href,'/cbb/players/')]/@href"))
    if not hrefs:
        return None
    href = hrefs[0]
    return href if href.startswith("http") else f"https://www.sports-reference.com{href}"


def fetch_cbb_line(slug_or_url: str = "", *, name: str = "") -> Optional[dict]:
    """Latest-season college line — by slug/URL, or resolved from a player NAME.

    Returns the six radar values + context, or None if no page is found.
    """
    if name and not slug_or_url:
        url = _resolve_cbb_url(name)
        if not url:
            return None
    elif slug_or_url.startswith("http"):
        url = slug_or_url
    else:
        url = f"https://www.sports-reference.com/cbb/players/{slug_or_url}.html"

    html = _sr_get(url)
    if not html:
        return None
    doc = H.fromstring(html)

    player_name = (doc.xpath("//h1//span/text()") or doc.xpath("//h1/text()") or [name or "?"])[0].strip()
    pg = doc.xpath("//table[contains(@id,'players_per_game') or @id='per_game']")
    adv = doc.xpath("//table[contains(@id,'advanced')]")
    if not pg:
        return None

    pg_rows = pg[0].xpath(".//tbody/tr[.//td]")
    if not pg_rows:
        return None
    r0 = pg_rows[-1]  # most recent college season

    ppg = _num(_cell(r0, "pts_per_g"))
    rpg = _num(_cell(r0, "trb_per_g"))
    apg = _num(_cell(r0, "ast_per_g"))
    spg = _num(_cell(r0, "stl_per_g")) or 0.0
    bpg = _num(_cell(r0, "blk_per_g")) or 0.0
    fg3 = _num(_cell(r0, "fg3_pct"))

    ts = None
    if adv:
        adv_rows = adv[0].xpath(".//tbody/tr[.//td]")
        if adv_rows:
            ts = _num(_cell(adv_rows[-1], "ts_pct"))

    return {
        "name": player_name,
        "url": url,
        "season": _cell(r0, "year_id"),
        "team": _cell(r0, "team_name_abbr"),
        "games": _num(_cell(r0, "games")),
        "radar": {
            "scoring": ppg,                       # PPG
            "efficiency": ts,                     # TS%
            "playmaking": apg,                    # APG
            "rebounding": rpg,                    # RPG
            "defense": (spg + bpg),               # STL+BLK
            "shooting": fg3,                      # 3P%
        },
    }


# ─────────────────────────────────────────────────────────────────────────────
# NBA comp pool — NBA players matched on their OWN college production
# ─────────────────────────────────────────────────────────────────────────────

# Curated starter pool of NBA guards/wings with their sports-reference CBB slug.
# (Proof-of-concept size; expanded later.) Comps are drawn only from players
# whose college line we can actually pull.
NBA_COLLEGE_POOL = [
    ("Josh Hart", "josh-hart-1"),
    ("Jalen Brunson", "jalen-brunson-1"),
    ("Donovan Mitchell", "donovan-mitchell-1"),
    ("Marcus Smart", "marcus-smart-1"),
    ("Malcolm Brogdon", "malcolm-brogdon-1"),
    ("Desmond Bane", "desmond-bane-1"),
    ("Tyrese Maxey", "tyrese-maxey-1"),
    ("Immanuel Quickley", "immanuel-quickley-1"),
    ("CJ McCollum", "cj-mccollum-1"),
    ("Buddy Hield", "buddy-hield-1"),
    ("Jordan Poole", "jordan-poole-1"),
    ("Cade Cunningham", "cade-cunningham-1"),
    ("Jaden Ivey", "jaden-ivey-1"),
    ("Bennedict Mathurin", "bennedict-mathurin-1"),
    ("Devin Booker", "devin-booker-1"),
]

# Normalization scales for the six axes (typical high-major guard ranges),
# so Euclidean distance weights each axis comparably.
_RADAR_SCALE = {
    "scoring": 25.0,      # PPG
    "efficiency": 0.65,   # TS%
    "playmaking": 8.0,    # APG
    "rebounding": 11.0,   # RPG
    "defense": 4.0,       # STL+BLK
    "shooting": 0.45,     # 3P%
}


def _radar_similarity(a: dict, b: dict) -> float:
    """0–100 similarity between two radar dicts (higher = more alike)."""
    diffs = []
    for axis in RADAR_AXES:
        va, vb = a.get(axis), b.get(axis)
        if va is None or vb is None:
            continue
        scale = _RADAR_SCALE[axis]
        diffs.append(((va - vb) / scale) ** 2)
    if not diffs:
        return 0.0
    dist = (sum(diffs) / len(diffs)) ** 0.5  # normalized RMS distance
    return round(max(0.0, 100.0 * (1.0 - dist)), 0)


_POOL_CACHE_NAME = "nba_college_pool.json"


def build_pool_cache(force: bool = False) -> list[dict]:
    """Scrape the NBA comp pool's college lines ONCE and cache to disk.

    Called once by precompute; every prospect's radar match then reuses this
    instead of re-scraping 15 sports-reference pages per prospect.
    """
    from app import data_cache
    if not force:
        cached = data_cache.read_json(_POOL_CACHE_NAME)
        if cached:
            return cached
    lines = []
    for name, slug in NBA_COLLEGE_POOL:
        line = fetch_cbb_line(slug)
        time.sleep(_SR_DELAY)
        if line:
            line["display_name"] = name
            lines.append(line)
    data_cache.write_json(_POOL_CACHE_NAME, lines)
    return lines


def best_radar_comp(prospect_radar: dict, pool_lines: Optional[list] = None) -> Optional[dict]:
    """Closest NBA-college match from the cached pool (no scraping here)."""
    pool_lines = pool_lines if pool_lines is not None else build_pool_cache()
    best = None
    for line in pool_lines:
        sim = _radar_similarity(prospect_radar, line["radar"])
        if best is None or sim > best["match"]:
            best = {"name": line.get("display_name", line["name"]), "match": sim, "line": line}
    return best


# ─────────────────────────────────────────────────────────────────────────────
# College shot chart (ESPN men's college-basketball play-by-play)
# ─────────────────────────────────────────────────────────────────────────────
#
# Verified against official CBB totals for Brayden Burries: ESPN's `scoringPlay`
# boolean gives 49.2% FG vs. sports-reference's 49.1%, and 11.0 FGA/game matches
# exactly. Two correctness rules learned the hard way:
#   • made/missed comes from `scoringPlay` — NOT from parsing " makes "/" misses ".
#   • ESPN emits INT_MIN sentinels for untracked locations; keep only 0..50 coords,
#     and drop free throws (they aren't field goals).
# Coverage is ~90% of games (a few postseason games may be missing), which is
# plenty for a representative shot chart.

_ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball"
_ESPN_HEADERS = {"User-Agent": _UA, "Accept": "application/json"}
_ESPN_DELAY = 0.35


def _valid_shot_coord(c: Optional[dict]) -> bool:
    if not c:
        return False
    x, y = c.get("x"), c.get("y")
    return x is not None and y is not None and 0 <= x <= 50 and 0 <= y <= 50


def _espn_completed_game_ids(team_id: int, season: int) -> list[str]:
    r = requests.get(f"{_ESPN_BASE}/teams/{team_id}/schedule?season={season}",
                     headers=_ESPN_HEADERS, timeout=25)
    r.raise_for_status()
    out = []
    for e in r.json().get("events", []):
        comp = (e.get("competitions") or [{}])[0]
        if comp.get("status", {}).get("type", {}).get("completed"):
            out.append(e["id"])
    return out


def fetch_college_shots(player_name: str, team_id: int, season: int) -> Optional[dict]:
    """Aggregate a player's season field-goal attempts (with court coords) from
    ESPN play-by-play across all of their team's completed games.

    Returns {made, attempts, fg_pct, shots:[{x,y,made,value}], games} or None.
    """
    try:
        game_ids = _espn_completed_game_ids(team_id, season)
    except Exception:
        return None

    made = attempts = games_seen = 0
    shots: list[dict] = []
    for gid in game_ids:
        try:
            plays = requests.get(f"{_ESPN_BASE}/summary?event={gid}",
                                 headers=_ESPN_HEADERS, timeout=25).json().get("plays", [])
        except Exception:
            continue
        found = False
        for p in plays:
            if not p.get("shootingPlay"):
                continue
            txt = p.get("text", "") or ""
            if not txt.startswith(player_name) or "free throw" in txt.lower():
                continue
            is_made = bool(p.get("scoringPlay"))
            made += is_made
            attempts += 1
            found = True
            c = p.get("coordinate") or {}
            if _valid_shot_coord(c):
                shots.append({"x": c["x"], "y": c["y"], "made": is_made,
                              "value": p.get("scoreValue")})
        games_seen += found
        time.sleep(_ESPN_DELAY)

    if attempts == 0:
        return None
    return {
        "player": player_name,
        "made": made,
        "attempts": attempts,
        "fg_pct": round(made / attempts, 3),
        "games": games_seen,
        "shots": shots,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Combine measurements + NBA-guard percentiles (nba_api / stats.nba.com)
# ─────────────────────────────────────────────────────────────────────────────
#
# Verified for Brayden Burries (2026): height 6'3.75", weight 215, wingspan 6'6",
# standing reach 8'2.5" — matching the source card exactly. Uses the official
# draft-combine endpoint (the old Basketball-Reference /combine.html URLs 404 now).
# Not every prospect attends the combine (esp. international) — those return None.

# The five measurements we compare, with the combine-stats column name and whether
# a bigger value is "better" (all of these: bigger = more highly rated for a guard).
_COMBINE_FIELDS = {
    "height": "HEIGHT_WO_SHOES",
    "wingspan": "WINGSPAN",
    "standing_reach": "STANDING_REACH",
    "weight": "WEIGHT",
    "max_vertical": "MAX_VERTICAL_LEAP",
}

_guard_pool_cache: Optional[dict] = None


def _combine_frame(season: str):
    return draftcombinestats.DraftCombineStats(
        season_all_time=season, timeout=60
    ).get_data_frames()[0]


def _guard_percentile_pool() -> dict:
    """Historical combine guards, per measurement, for percentile ranking."""
    global _guard_pool_cache
    if _guard_pool_cache is not None:
        return _guard_pool_cache
    df = _combine_frame("All Time")
    guards = df[df["POSITION"].astype(str).str.contains("G", na=False)]
    pool = {}
    for key, col in _COMBINE_FIELDS.items():
        vals = [float(v) for v in guards[col].tolist()
                if v is not None and str(v) not in ("", "nan")]
        pool[key] = sorted(vals)
    _guard_pool_cache = pool
    return pool


def _percentile(sorted_vals: list[float], x: float) -> int:
    if not sorted_vals:
        return 0
    below = sum(1 for v in sorted_vals if v < x)
    return round(100 * below / len(sorted_vals))


# Per-measure scales (inches / lbs) so distance weights each comparably.
_COMBINE_SCALE = {"height": 5.0, "weight": 28.0, "wingspan": 6.0,
                  "standing_reach": 7.0, "max_vertical": 6.0}
_guard_profiles_cache: Optional[list] = None


def _guard_profiles() -> list[dict]:
    """Historical combine guards as {name, vals{measure->value}} for comp search."""
    global _guard_profiles_cache
    if _guard_profiles_cache is not None:
        return _guard_profiles_cache
    df = _combine_frame("All Time")
    guards = df[df["POSITION"].astype(str).str.contains("G", na=False)]
    profs = []
    for _, r in guards.iterrows():
        vals = {}
        for key, col in _COMBINE_FIELDS.items():
            raw = r.get(col)
            vals[key] = float(raw) if raw is not None and str(raw) not in ("", "nan") else None
        if vals["height"] and vals["wingspan"] and vals["weight"]:  # usable comp
            profs.append({"name": str(r.get("PLAYER_NAME", "")).strip(), "vals": vals})
    _guard_profiles_cache = profs
    return profs


def _nearest_combine_guard(prospect_vals: dict, exclude_name: str) -> Optional[dict]:
    """Closest historical combine guard by anthropometrics."""
    best = None
    for prof in _guard_profiles():
        if prof["name"].lower() == exclude_name.lower():
            continue
        diffs = []
        for key, scale in _COMBINE_SCALE.items():
            a, b = prospect_vals.get(key), prof["vals"].get(key)
            if a is None or b is None:
                continue
            diffs.append(((a - b) / scale) ** 2)
        if len(diffs) < 3:  # need enough shared measures to trust the match
            continue
        rms = (sum(diffs) / len(diffs)) ** 0.5
        match = round(max(0.0, 100.0 * (1.0 - rms)))
        if best is None or match > best["match"]:
            best = {"name": prof["name"], "match": match,
                    "values": {k: v for k, v in prof["vals"].items() if v is not None}}
    return best


def fetch_combine(player_name: str, draft_year: int) -> Optional[dict]:
    """Combine measurements + guard percentiles for a prospect, or None if the
    player didn't attend the combine that year."""
    try:
        df = _combine_frame(str(draft_year))
    except Exception:
        return None
    hit = df[df["PLAYER_NAME"].astype(str).str.contains(player_name, case=False, na=False)]
    if hit.empty:
        return None
    row = hit.iloc[0]

    pool = _guard_percentile_pool()
    measures = {}
    for key, col in _COMBINE_FIELDS.items():
        raw = row.get(col)
        if raw is None or str(raw) in ("", "nan"):
            measures[key] = None
            continue
        val = float(raw)
        measures[key] = {"value": val, "percentile": _percentile(pool.get(key, []), val)}

    prospect_vals = {k: (m["value"] if m else None) for k, m in measures.items()}
    comp = _nearest_combine_guard(prospect_vals, exclude_name=player_name)

    return {
        "player": player_name,
        "position": str(row.get("POSITION", "")),
        "height_ft_in": str(row.get("HEIGHT_WO_SHOES_FT_IN", "")).strip(),
        "wingspan_ft_in": str(row.get("WINGSPAN_FT_IN", "")).strip(),
        "standing_reach_ft_in": str(row.get("STANDING_REACH_FT_IN", "")).strip(),
        "measures": measures,
        "comp": comp,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Shot-chart comp pool — recent draftees with good ESPN coordinate coverage
# ─────────────────────────────────────────────────────────────────────────────
#
# Matched on shot *distribution* (where a player shoots), not raw makes. Older
# seasons have sparse ESPN coords, so the pool is recent (2024–25) college years.

SHOT_COMP_POOL = [
    ("Tyrese Proctor", "Duke", 2025),
    ("Cooper Flagg", "Duke", 2025),
    ("Kon Knueppel", "Duke", 2025),
    ("Jared McCain", "Duke", 2024),
    ("Reed Sheppard", "Kentucky", 2024),
    ("Rob Dillingham", "Kentucky", 2024),
    ("Stephon Castle", "Connecticut", 2024),
    ("Dalton Knecht", "Tennessee", 2024),
    ("Ja'Kobe Walter", "Baylor", 2024),
    ("Tyler Kolek", "Marquette", 2024),
    ("Zach Edey", "Purdue", 2024),
    ("Cody Williams", "Colorado", 2024),
]
_SHOT_POOL_CACHE_NAME = "shot_comp_pool.json"


def _shot_histogram(shots: list[dict]) -> dict:
    """Fraction of shots by zone — the shot-profile signature."""
    z = {"rim": 0, "close": 0, "mid2": 0, "corner3": 0, "wing3": 0}
    for s in shots:
        y, x, v = s.get("y", 0), s.get("x", 25), s.get("value")
        if v == 3:
            z["corner3" if (x <= 9 or x >= 41) else "wing3"] += 1
        elif y <= 5:
            z["rim"] += 1
        elif y <= 9:
            z["close"] += 1
        else:
            z["mid2"] += 1
    tot = sum(z.values()) or 1
    return {k: v / tot for k, v in z.items()}


def _shot_similarity(h1: dict, h2: dict) -> int:
    l1 = sum(abs(h1[k] - h2[k]) for k in h1)  # histograms sum to 1 → L1 in [0,2]
    return round(max(0.0, 100.0 * (1.0 - l1 / 2.0)))


def build_shot_pool_cache(team_map: Optional[dict] = None, force: bool = False) -> list[dict]:
    """Fetch the shot-comp pool's college shot charts ONCE and cache to disk."""
    from app import data_cache
    if not force:
        cached = data_cache.read_json(_SHOT_POOL_CACHE_NAME)
        if cached:
            return cached
    team_map = team_map or espn_team_map()
    pool = []
    for name, college, season in SHOT_COMP_POOL:
        tid = resolve_espn_team_id(college, team_map)
        if not tid:
            continue
        sc = fetch_college_shots(name, tid, season)
        if sc and sc.get("shots"):
            sc["hist"] = _shot_histogram(sc["shots"])
            pool.append(sc)
    data_cache.write_json(_SHOT_POOL_CACHE_NAME, pool)
    return pool


def best_shot_comp(prospect_shots: dict, pool: Optional[list] = None) -> Optional[dict]:
    """Closest shot-profile match from the pool, excluding self."""
    if not prospect_shots or not prospect_shots.get("shots"):
        return None
    pool = pool if pool is not None else build_shot_pool_cache()
    ph = _shot_histogram(prospect_shots["shots"])
    best = None
    for c in pool:
        if c["player"].lower() == prospect_shots.get("player", "").lower():
            continue
        m = _shot_similarity(ph, c["hist"])
        if best is None or m > best["match"]:
            best = {"player": c["player"], "match": m, "made": c["made"],
                    "attempts": c["attempts"], "fg_pct": c["fg_pct"], "shots": c["shots"]}
    return best


# ─────────────────────────────────────────────────────────────────────────────
# Assembly — the three cards for one prospect
# ─────────────────────────────────────────────────────────────────────────────

def build_prospect_comparison(prospect: dict, pool_lines: Optional[list] = None,
                              shot_pool: Optional[list] = None) -> dict:
    """Produce the three comparison cards for one prospect.

    prospect keys: name, draft_year, and either cbb_slug OR (resolve stats by
    name); espn_team_id + cbb_season_end enable the shot chart. Each card is
    independently None-able, so a player missing a data source (e.g. an
    international prospect with no CBB page or combine) degrades gracefully.
    """
    name = prospect["name"]
    out: dict = {"player": name, "cards": {}}

    # Card 1 — radar stat comp (stats by slug if given, else resolved by name)
    line = (fetch_cbb_line(prospect["cbb_slug"]) if prospect.get("cbb_slug")
            else fetch_cbb_line(name=name))
    time.sleep(_SR_DELAY)
    if line and line["radar"].get("scoring") is not None:
        out["cards"]["radar"] = {
            "prospect": {"name": line["name"], "season": line["season"],
                         "team": line["team"], "radar": line["radar"]},
            "comp": best_radar_comp(line["radar"], pool_lines),
        }
    else:
        out["cards"]["radar"] = None

    # Card 2 — shot chart (prospect's real hexbin; comp is a later enhancement)
    tid = prospect.get("espn_team_id")
    season = prospect.get("cbb_season_end")
    prospect_shots = fetch_college_shots(name, tid, season) if tid and season else None
    out["cards"]["shot_chart"] = (
        {"prospect": prospect_shots, "comp": best_shot_comp(prospect_shots, shot_pool)}
        if prospect_shots else None
    )

    # Card 3 — combine comp
    out["cards"]["combine"] = fetch_combine(name, prospect["draft_year"])

    return out


# ─────────────────────────────────────────────────────────────────────────────
# Draft-class batch + precompute cache
# ─────────────────────────────────────────────────────────────────────────────
#
# Cards for a whole draft class are built once by a local precompute step
# (scrapes are slow / rate-limited / cloud-blocked) and cached to
# data_cache/draft_comp_<slug>.json, with an index at draft_comp_index.json.
# The router serves the cached JSON.

_INDEX_NAME = "draft_comp_index.json"

# ESPN names some schools differently from NBA draft-history's "college" field.
_ESPN_TEAM_ALIASES = {
    "brigham young": "byu",
    "connecticut": "uconn",
    "southern california": "usc",
    "mississippi": "ole miss",
    "north carolina state": "nc state",
    "louisiana state": "lsu",
    "central florida": "ucf",
    "nevada-las vegas": "unlv",
    "pittsburgh": "pitt",
    "saint mary's (ca)": "saint mary's",
}


def _slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def _cache_name(slug: str) -> str:
    return f"draft_comp_{slug}.json"


def espn_team_map() -> dict:
    """{lowercased team name/location/nickname -> ESPN team id} for D1."""
    r = requests.get(f"{_ESPN_BASE}/teams?limit=500", headers=_ESPN_HEADERS, timeout=25)
    r.raise_for_status()
    out = {}
    for t in r.json()["sports"][0]["leagues"][0]["teams"]:
        tt = t["team"]
        for key in (tt.get("displayName"), tt.get("shortDisplayName"),
                    tt.get("location"), tt.get("name"), tt.get("nickname")):
            if key:
                out[key.lower()] = tt["id"]
    return out


def resolve_espn_team_id(college: str, team_map: dict) -> Optional[str]:
    if not college:
        return None
    key = re.sub(r"\s*\(.*\)\s*", "", college).strip().lower()  # drop "(Spain)" etc.
    if key in team_map:
        return team_map[key]
    if key in _ESPN_TEAM_ALIASES and _ESPN_TEAM_ALIASES[key] in team_map:
        return team_map[_ESPN_TEAM_ALIASES[key]]
    # try dropping a trailing "University"/"State" wording
    alt = key.replace(" university", "").replace("university of ", "")
    return team_map.get(alt)


def precompute_draft_class(year: int = 2026, limit: Optional[int] = None,
                           progress: bool = True) -> list[dict]:
    """Build + cache cards for every player in a real draft class."""
    from app import data_cache
    from app.routers.draft_simulator import get_draft_class

    pool_lines = build_pool_cache()          # scrape NBA comp pool once
    team_map = espn_team_map()
    draft_class = get_draft_class(year)
    if limit:
        draft_class = draft_class[:limit]

    index = []
    for i, p in enumerate(draft_class, 1):
        name = p["name"]
        if not name:
            continue
        slug = _slugify(name)
        college = (p.get("college") or "").strip()
        tid = resolve_espn_team_id(college, team_map)
        prospect = {"name": name, "draft_year": year,
                    "espn_team_id": tid, "cbb_season_end": year}
        try:
            data = build_prospect_comparison(prospect, pool_lines=pool_lines)
        except Exception as e:
            data = {"player": name, "cards": {"radar": None, "shot_chart": None, "combine": None},
                    "error": str(e)}
        data.update({"slug": slug, "pick": p.get("pick"), "college": college})
        data_cache.write_json(_cache_name(slug), data)

        cards = data.get("cards", {})
        entry = {"slug": slug, "name": name, "pick": p.get("pick"), "college": college,
                 "has_radar": bool(cards.get("radar")), "has_shot_chart": bool(cards.get("shot_chart")),
                 "has_combine": bool(cards.get("combine"))}
        index.append(entry)
        if progress:
            print(f"[{i}/{len(draft_class)}] #{p.get('pick')} {name} "
                  f"(radar={entry['has_radar']} shots={entry['has_shot_chart']} combine={entry['has_combine']})",
                  flush=True)
        # Pace sports-reference well under its ~20 req/min jail (each player is
        # up to 2 SR requests: name-resolve + page). ~4s idle keeps us ~16/min.
        time.sleep(4.0)

    data_cache.write_json(_INDEX_NAME, {"year": year, "prospects": index})
    return index


def enrich_comps(progress: bool = True) -> int:
    """Backfill combine + shot-chart comps into already-cached player files
    without re-scraping their (expensive) prospect data. Idempotent."""
    from app import data_cache
    idx = data_cache.read_json(_INDEX_NAME) or {}
    shot_pool = build_shot_pool_cache()          # fetch once
    _guard_profiles()                            # warm the combine-comp pool
    n = 0
    for entry in idx.get("prospects", []):
        slug = entry["slug"]
        data = data_cache.read_json(_cache_name(slug))
        if not data:
            continue
        cards = data.get("cards", {})

        sc = cards.get("shot_chart")
        if sc and sc.get("prospect") and not sc.get("comp"):
            sc["comp"] = best_shot_comp(sc["prospect"], shot_pool)

        cb = cards.get("combine")
        if cb and not cb.get("comp"):
            vals = {k: (m["value"] if m else None) for k, m in cb.get("measures", {}).items()}
            cb["comp"] = _nearest_combine_guard(vals, exclude_name=data.get("player", ""))

        data_cache.write_json(_cache_name(slug), data)
        n += 1
        if progress:
            print(f"enriched {slug}", flush=True)
    return n


def get_cached(slug: str) -> Optional[dict]:
    from app import data_cache
    return data_cache.read_json(_cache_name(slug))


def list_available() -> list[dict]:
    """The cached draft-class index for the prospect picker."""
    from app import data_cache
    idx = data_cache.read_json(_INDEX_NAME)
    return (idx or {}).get("prospects", []) if idx else []
