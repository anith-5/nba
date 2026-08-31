"""Current team rosters from ESPN.

WHY THIS EXISTS: rosters.json is normally refreshed by precompute.py calling
stats.nba.com. That host blocks a lot of networks outright (the whole reason
data_cache exists), and on a blocked network there is no way to refresh rosters
at all — they stay frozen at whenever the last snapshot was taken, which goes
stale the moment the offseason starts moving players.

ESPN publishes an undocumented but unauthenticated JSON API that is reachable
where stats.nba.com is not, and it carries everything rosters.json needs. This
module is a second, independent path to the same file.

IDENTITY IS THE HARD PART. ESPN has its own athlete ids; every analytics
feature in this app keys off NBA's. So each player carries up to three:

  player_id   real NBA id, or None. NEVER invented -- it is a query parameter
              for stats.nba.com, so a made-up value produces a link that looks
              live and silently returns nothing. None is honest.
  espn_id     always present; stable handle from the source.
  draft_slug  set when data_cache/draft_comp_<slug>.json exists, so a rookie
              with no NBA history still links to real college production.

Roughly 84% of players match an NBA id. The rest are almost entirely rookies
and camp invites who have never played an NBA game, so no id exists yet -- they
have no NBA stats to show either. When they debut and nba_api's bundled list
catches up, the next refresh promotes them automatically.

NOTE ON SEASON: in the offseason ESPN reports the UPCOMING season (e.g.
2026-27) while every stat snapshot in data_cache is the completed one. That
mix is intentional and is what basketball-reference and every trade machine
show in August -- current rosters, most recent stats. The season ESPN reports
is recorded on each team so it is never ambiguous which is which.
"""

from __future__ import annotations

import glob
import json
import os
import re
import unicodedata
from pathlib import Path
from typing import Any, Optional

import requests

from nba_api.stats.static import players as static_players
from nba_api.stats.static import teams as static_teams

from app import data_cache

ESPN_TEAMS_URL = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams"
ESPN_ROSTER_URL = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/{}/roster"

# ESPN spells one franchise differently from nba_api.
TEAM_NAME_ALIASES = {"LA Clippers": "Los Angeles Clippers"}

# Deliberately NO User-Agent override. ESPN 403s a descriptive one --
# "Mozilla/5.0 (compatible; HoopIQ/1.0)" and a full Chrome UA string both get
# rejected, while requests' own default and a bare "Mozilla/5.0" both return
# 200. Setting a "proper" UA here looks like an improvement and silently breaks
# every fetch, so leave it alone.
_TIMEOUT = 25


def _norm_strict(s: str) -> str:
    """Accents and punctuation stripped, generational suffix KEPT.

    Keeping the suffix is what separates a father from a son: nba_api carries
    both 'Jaren Jackson' (retired) and 'Jaren Jackson Jr.' (active).
    """
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z ]", "", s.lower()).strip()


def _norm_loose(s: str) -> str:
    """Also drops the suffix, for sources that spell it differently (or omit
    it). Ambiguous by construction — only ever used with an active-player
    tiebreak, never on its own."""
    s = _norm_strict(s)
    return re.sub(r"\b(jr|sr|ii|iii|iv|v)\b", "", s).strip()


def _slugify(name: str) -> str:
    n = unicodedata.normalize("NFKD", name or "").encode("ascii", "ignore").decode().lower()
    n = re.sub(r"[.']", "", n)
    n = re.sub(r"\s+(jr|sr|ii|iii|iv)$", "", n)
    return re.sub(r"[^a-z0-9]+", "-", n).strip("-")


def _height_to_dashed(display_height: Optional[str]) -> Optional[str]:
    """ESPN gives  6' 10\"  ; rosters.json has always used  6-10 ."""
    if not display_height:
        return None
    m = re.match(r"\s*(\d+)\s*'\s*(\d+)?", display_height)
    if not m:
        return None
    return f"{m.group(1)}-{m.group(2) or 0}"


def _nba_player_index() -> tuple[dict[str, dict], dict[str, list]]:
    """Two name indexes over nba_api's bundled static list (no network needed).

    Returns (strict, loose). `strict` keys on the full name including any
    generational suffix; `loose` keys on the suffix-stripped name and holds
    EVERY candidate, because that form genuinely collides — 'Jaren Jackson'
    matches both the retired father and the active son. Resolving a loose hit
    requires the active-player tiebreak in _match_player.
    """
    strict: dict[str, dict] = {}
    loose: dict[str, list] = {}
    for p in static_players.get_players():
        strict.setdefault(_norm_strict(p["full_name"]), p)
        loose.setdefault(_norm_loose(p["full_name"]), []).append(p)
    return strict, loose


def _match_player(full_name: str, strict: dict, loose: dict) -> Optional[dict]:
    """Resolve an ESPN name to an nba_api record, or None.

    Exact-with-suffix wins outright. Only if that misses do we fall back to
    the suffix-stripped form, and then only when exactly one ACTIVE player
    fits — an ambiguous match returns None rather than guessing, because a
    wrong-but-real player_id is worse than none at all: it silently loads
    another player's career under this player's name.
    """
    hit = strict.get(_norm_strict(full_name))
    if hit:
        return hit
    candidates = loose.get(_norm_loose(full_name), [])
    if len(candidates) == 1:
        return candidates[0]
    active = [c for c in candidates if c.get("is_active")]
    return active[0] if len(active) == 1 else None


def _draft_slugs() -> set[str]:
    pattern = str(data_cache.CACHE_DIR / "draft_comp_*.json")
    return {
        os.path.basename(p)[len("draft_comp_"):-len(".json")]
        for p in glob.glob(pattern)
    }


def _get(url: str) -> dict:
    r = requests.get(url, timeout=_TIMEOUT)
    r.raise_for_status()
    return r.json()


def team_assignments(rosters: dict[str, Any]) -> dict[int, dict[str, str]]:
    """player_id -> {'full_name', 'abbreviation'} from a rosters.json blob.

    Only players with a real NBA id appear: the other datasets are keyed by
    NBA id, so a rookie without one has nothing to match against.
    """
    by_id = {t["id"]: t for t in static_teams.get_teams()}
    out: dict[int, dict[str, str]] = {}
    for team in rosters.values():
        meta = by_id.get(team.get("team_id"))
        if not meta:
            continue
        for p in team.get("players", []):
            if p.get("player_id"):
                out[p["player_id"]] = {
                    "full_name": meta["full_name"],
                    "abbreviation": meta["abbreviation"],
                }
    return out


def propagate_team_assignments(rosters: dict[str, Any], verbose: bool = True) -> dict[str, int]:
    """Push refreshed team assignments into the other datasets keyed by NBA id.

    WHY: rosters.json is not the only place a player's team is recorded.
    trades_pool.json (Trade Machine) and the web bundle's
    current_nba_players.json each carry their own copy, and refreshing only
    rosters.json leaves the app contradicting itself — the Lineup Optimizer
    showing a player on his new team while the Trade Machine still offers him
    from the old one.

    ONLY the team fields are touched. Per-player stats and salaries stay put:
    those are last-season figures and are still correct for a traded player.
    It's the team that went stale, not the production.
    """
    assign = team_assignments(rosters)
    stats = {"trade_pool_updated": 0, "web_updated": 0,
             "trade_pool_off_roster": 0, "web_off_roster": 0}

    # --- Trade Machine pool -------------------------------------------------
    pool = data_cache.read_json("trades_pool.json")
    if pool:
        for p in pool:
            new = assign.get(p.get("player_id"))
            if not new:
                stats["trade_pool_off_roster"] += 1
                continue
            if p.get("team") != new["abbreviation"]:
                p["team"] = new["abbreviation"]
                stats["trade_pool_updated"] += 1
        data_cache.write_json("trades_pool.json", pool)

    # --- Web bundle ---------------------------------------------------------
    # Lives outside services/api, so it's addressed relative to this file.
    web_path = (Path(__file__).resolve().parents[3]
                / "apps" / "web" / "src" / "data" / "current_nba_players.json")
    if web_path.exists():
        blob = json.loads(web_path.read_text(encoding="utf-8"))
        # Conference/division aren't in nba_api's static team list, but they
        # don't change — carry them over from whatever the file already knows
        # about the destination team.
        geo = {p["team_abbreviation"]: (p.get("conference"), p.get("division"))
               for p in blob.get("players", []) if p.get("team_abbreviation")}
        for p in blob.get("players", []):
            new = assign.get(p.get("player_id"))
            if not new:
                stats["web_off_roster"] += 1
                continue
            if p.get("team_abbreviation") != new["abbreviation"]:
                p["team_full_name"] = new["full_name"]
                p["team_abbreviation"] = new["abbreviation"]
                conf, div = geo.get(new["abbreviation"], (None, None))
                if conf:
                    p["conference"], p["division"] = conf, div
                stats["web_updated"] += 1
        blob["team_source"] = "espn"
        web_path.write_text(
            json.dumps(blob, ensure_ascii=False, indent=1), encoding="utf-8")

    if verbose:
        print(f"      trade pool: {stats['trade_pool_updated']} team changes "
              f"({stats['trade_pool_off_roster']} not on any current roster)")
        print(f"      web bundle: {stats['web_updated']} team changes "
              f"({stats['web_off_roster']} not on any current roster)")
    return stats


def build_rosters(verbose: bool = True) -> dict[str, Any]:
    """Fetch all 30 rosters from ESPN, keyed by NBA team id as a string so the
    result is a drop-in replacement for the existing rosters.json."""
    strict_idx, loose_idx = _nba_player_index()
    slugs = _draft_slugs()
    nba_teams = {t["full_name"]: t for t in static_teams.get_teams()}

    espn_teams = _get(ESPN_TEAMS_URL)["sports"][0]["leagues"][0]["teams"]
    out: dict[str, Any] = {}
    matched = total = 0

    for entry in espn_teams:
        team = entry["team"]
        abbr = team["abbreviation"]
        display = team["displayName"]
        nba_team = nba_teams.get(TEAM_NAME_ALIASES.get(display, display))
        if not nba_team:
            if verbose:
                print(f"      {abbr}: no nba_api team matches '{display}' — skipped")
            continue

        try:
            payload = _get(ESPN_ROSTER_URL.format(abbr.lower()))
        except Exception as e:  # noqa: BLE001 - one bad team shouldn't kill the run
            if verbose:
                print(f"      {abbr}: roster fetch failed ({e}) — skipped")
            continue

        players = []
        for a in payload.get("athletes", []):
            full_name = a.get("fullName") or a.get("displayName") or ""
            nba_match = _match_player(full_name, strict_idx, loose_idx)
            slug = _slugify(full_name)
            total += 1
            if nba_match:
                matched += 1
            players.append({
                "player_id": nba_match["id"] if nba_match else None,
                "espn_id": str(a.get("id")) if a.get("id") is not None else None,
                "draft_slug": slug if (nba_match is None and slug in slugs) else None,
                "name": full_name,
                "number": a.get("jersey") or None,
                "position": (a.get("position") or {}).get("abbreviation"),
                "height": _height_to_dashed(a.get("displayHeight")),
                "age": a.get("age"),
            })

        out[str(nba_team["id"])] = {
            "team_id": nba_team["id"],
            "team_name": nba_team["full_name"],
            "season": (payload.get("season") or {}).get("displayName"),
            "source": "espn",
            "players": players,
        }
        if verbose:
            print(f"      {abbr:4s} {len(players):2d} players")

    if verbose and total:
        linked = sum(
            1 for t in out.values() for p in t["players"] if p["draft_slug"]
        )
        print(f"      {matched}/{total} matched an NBA player_id "
              f"({100 * matched / total:.1f}%); {linked} of the rest link to a draft card")
    return out
