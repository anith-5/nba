"""
Two-layer comp database: primary archetype (KMeans-20, reference-labeled) +
badge system, used to find historically similar players for the
Development Trajectory feature.

Scope vs. the full spec (see colab/nba_trajectory_model.py for the complete
historical version): this live build only pulls data sources that are cheap
enough for a local background build —

  Pulled live:      leaguedashplayerstats (Base+Advanced), shotchartdetail,
                     leaguedashplayerclutch, leaguehustlestatsplayer,
                     Basketball-Reference Advanced (BPM/VORP/WS) + Combine.
  NOT pulled live:   synergyplaytypes, playerdashptshots, playerdashptpasstracking,
                     leagueseasonmatchups — these need thousands of extra
                     per-player-season calls. Badges that depend on them
                     (Spot Up Shooter, Pick and Roll Maestro, Transition
                     Initiator, Lob Threat, Post Scorer, Off Screen Shooter,
                     Pull Up Shooter, Secondary Playmaker, Physical Post
                     Defender, Switchable Defender, Perimeter Lockdown) are
                     simply unavailable here and always return None — run
                     the Colab notebook for the full 28-badge version.

16 of 28 badges are computable live:
  Rim Finisher, Contact Finisher, Athletic Dunker, Floater Specialist,
  Corner Three Specialist, Volume Scorer, Clutch Scorer, Mid Range Assassin,
  Primary Playmaker, Help Side Defender, Passing Lane Interceptor,
  Offensive Glass Crasher, Defensive Rebounding Anchor, Rebounding Wing,
  Elite Athlete, Length and Versatility, High Motor.
"""

from __future__ import annotations

import json
import logging
import math
import pickle
import threading
import time
from io import StringIO
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd
import requests
from nba_api.stats.endpoints import (
    commonplayerinfo,
    leaguedashplayerclutch,
    leaguedashplayerstats,
    leaguehustlestatsplayer,
    playercareerstats,
    shotchartdetail,
)
from nba_api.stats.static import players as static_players
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler

logger = logging.getLogger(__name__)

DB_PATH = Path(__file__).parent / "comp_db.pkl"
# Portable JSON snapshot of the comp DB entries, committed and shipped to the
# cloud (the pickle is gitignored + not portable across Python/sklearn versions).
# Lives in data_cache/ alongside the other pre-computed snapshots.
COMP_ENTRIES_JSON = Path(__file__).parent.parent / "data_cache" / "comp_entries.json"
DB_MAX_AGE_DAYS = 7
RATE_LIMIT = 0.7
HUSTLE_ERA_CUTOFF = "2016-17"
BBREF_HEADERS = {"User-Agent": "Mozilla/5.0 (research; personal analytics project)"}

# ─────────────────────────────────────────────────────────────────────────────
# Archetypes
# ─────────────────────────────────────────────────────────────────────────────

ARCHETYPE_NAMES = [
    "Pass First Point Guard", "Scoring Point Guard", "Two Way Point Guard",
    "Shoot First Two Guard", "Scoring Two Guard", "Two Way Wing", "3 and D Wing",
    "Stretch Four", "Power Forward Scorer", "Athletic Power Forward",
    "Versatile Forward", "3 and D Forward", "Defensive Forward", "Stretch Center",
    "Interior Scorer", "Two Way Center", "Passing Big", "Defensive Anchor",
    "Floor Spacing Big", "Unicorn",
]
N_ARCHETYPES = len(ARCHETYPE_NAMES)

REFERENCE_PLAYERS = {
    "Scoring Point Guard":     ["Stephen Curry", "Damian Lillard", "Trae Young"],
    "Pass First Point Guard":  ["Chris Paul", "Steve Nash", "Rajon Rondo"],
    "Two Way Point Guard":     ["Jrue Holiday", "Fred VanVleet", "Marcus Smart"],
    "Shoot First Two Guard":   ["Klay Thompson", "JJ Redick", "Duncan Robinson"],
    "Scoring Two Guard":       ["Kobe Bryant", "Dwyane Wade", "James Harden"],
    "Two Way Wing":            ["Kawhi Leonard", "Jimmy Butler", "OG Anunoby"],
    "3 and D Wing":            ["Mikal Bridges", "Bruce Brown", "Dorian Finney-Smith"],
    "Stretch Four":            ["Kevin Durant", "Dirk Nowitzki", "Kristaps Porzingis"],
    "Power Forward Scorer":    ["LaMarcus Aldridge", "Pascal Siakam"],
    "Athletic Power Forward":  ["Giannis Antetokounmpo", "Zion Williamson", "Blake Griffin"],
    "Versatile Forward":       ["LeBron James", "Jayson Tatum", "Scottie Barnes"],
    "3 and D Forward":         ["PJ Tucker", "Royce O'Neale", "Thaddeus Young"],
    "Defensive Forward":       ["Draymond Green", "Luol Deng"],
    "Stretch Center":          ["Karl-Anthony Towns", "Brook Lopez"],
    "Interior Scorer":         ["Shaquille O'Neal", "Joel Embiid", "Dwight Howard"],
    "Two Way Center":          ["Bam Adebayo", "Myles Turner"],
    "Passing Big":             ["Nikola Jokic", "Domantas Sabonis", "Marc Gasol"],
    "Defensive Anchor":        ["Rudy Gobert", "Ben Wallace", "Dikembe Mutombo"],
    "Floor Spacing Big":       ["Brook Lopez", "Kristaps Porzingis"],
    "Unicorn":                 ["LeBron James", "Giannis Antetokounmpo", "Luka Doncic", "Draymond Green"],
}

CLUSTER_FEATURE_COLS = [
    "points_per36", "assists_per36", "rebounds_per36", "steals_per36",
    "blocks_per36", "turnovers_per36", "ts_pct", "efg_pct", "ftr",
    "ast_pct", "stl_pct", "blk_pct", "oreb_pct", "dreb_pct", "usage_pct",
    "three_rate", "rim_attempt_rate", "midrange_attempt_rate",
    "position_numeric", "position_numeric",  # weighted x2, see _build_player_entries
]

ADJACENT_ARCHETYPES = {
    frozenset(["Scoring Point Guard", "Two Way Point Guard"]),
    frozenset(["Pass First Point Guard", "Two Way Point Guard"]),
    frozenset(["Shoot First Two Guard", "Scoring Two Guard"]),
    frozenset(["Two Way Wing", "Versatile Forward"]),
    frozenset(["Athletic Power Forward", "Versatile Forward"]),
    frozenset(["Athletic Power Forward", "Unicorn"]),
    frozenset(["Versatile Forward", "Unicorn"]),
    frozenset(["Passing Big", "Two Way Center"]),
    frozenset(["Interior Scorer", "Two Way Center"]),
    frozenset(["Rim Protector", "Defensive Anchor"]),
}

# Curated player list — same spread as the Colab version, trimmed slightly
# for live-build speed.
CURATED_PLAYERS: list[str] = [
    "LeBron James", "Kobe Bryant", "Tim Duncan", "Kevin Garnett", "Dirk Nowitzki",
    "Shaquille O'Neal", "Allen Iverson", "Dwyane Wade", "Steve Nash", "Chris Paul",
    "Kevin Durant", "Stephen Curry", "Nikola Jokic", "Giannis Antetokounmpo",
    "Luka Doncic", "Joel Embiid", "James Harden", "Kawhi Leonard",
    "Jayson Tatum", "Anthony Davis", "Devin Booker", "Donovan Mitchell",
    "Trae Young", "Anthony Edwards", "Ja Morant", "Shai Gilgeous-Alexander",
    "Damian Lillard", "Kyrie Irving", "Russell Westbrook", "Paul George",
    "Jimmy Butler", "Bam Adebayo", "Karl-Anthony Towns", "Zion Williamson",
    "Jaylen Brown", "Draymond Green", "Khris Middleton", "Pascal Siakam",
    "Julius Randle", "Rudy Gobert", "CJ McCollum", "Bradley Beal", "Zach LaVine",
    "John Wall", "Kemba Walker", "Victor Oladipo", "Andrew Wiggins",
    "Brandon Ingram", "Mikal Bridges", "Al Horford", "Carmelo Anthony",
    "Dwight Howard", "Derrick Rose", "Scottie Barnes", "Franz Wagner",
    "Evan Mobley", "Paolo Banchero", "Chet Holmgren", "Victor Wembanyama",
    "Tyrese Haliburton", "Desmond Bane", "Jaren Jackson Jr", "LaMelo Ball",
    "Jalen Brunson", "Josh Giddey", "Alperen Sengun", "Anthony Bennett",
    "Kwame Brown", "Michael Beasley", "Markelle Fultz", "Ben Simmons",
    "Marvin Bagley III", "Jonathan Isaac", "Klay Thompson", "Marcus Smart",
    "Domantas Sabonis", "Myles Turner",
]


# ─────────────────────────────────────────────────────────────────────────────
# Small helpers
# ─────────────────────────────────────────────────────────────────────────────

def _sleep():
    time.sleep(RATE_LIMIT)


def _safe(val, default: float = 0.0) -> float:
    try:
        v = float(val)
        return v if math.isfinite(v) else default
    except (TypeError, ValueError):
        return default


def _position_numeric(pos_str: str) -> float:
    p = str(pos_str).strip().upper()
    if "POINT" in p:
        return 1.0
    if "SHOOTING" in p or ("GUARD" in p and "FORWARD" not in p):
        return 2.0
    if "SMALL" in p:
        return 3.0
    if "POWER" in p:
        return 4.0
    if p in ("C", "CENTER"):
        return 5.0
    if "GUARD" in p and "FORWARD" in p:
        return 2.5
    if "FORWARD" in p and "CENTER" in p:
        return 4.5
    if "FORWARD" in p:
        return 3.5
    if "GUARD" in p:
        return 1.5
    return 3.0


def _season_to_bbref_year(season: str) -> int:
    return int(season.split("-")[0]) + 1


# ─────────────────────────────────────────────────────────────────────────────
# Per-season league-wide caches (one call covers every player that season)
# ─────────────────────────────────────────────────────────────────────────────

_season_advanced_cache: dict[str, pd.DataFrame] = {}
_season_clutch_cache: dict[str, pd.DataFrame] = {}
_season_hustle_cache: dict[str, pd.DataFrame] = {}
_season_bbref_cache: dict[str, pd.DataFrame] = {}
_combine_cache: Optional[pd.DataFrame] = None


def _get_season_advanced(season: str) -> pd.DataFrame:
    if season in _season_advanced_cache:
        return _season_advanced_cache[season]
    try:
        df = leaguedashplayerstats.LeagueDashPlayerStats(
            season=season, season_type_all_star="Regular Season",
            per_mode_detailed="Totals", measure_type_detailed_defense="Advanced",
            timeout=60,
        ).get_data_frames()[0]
        _sleep()
    except Exception as e:
        logger.warning("advanced stats failed for %s: %s", season, e)
        df = pd.DataFrame()
    _season_advanced_cache[season] = df
    return df


def _get_season_clutch(season: str) -> pd.DataFrame:
    if season in _season_clutch_cache:
        return _season_clutch_cache[season]
    try:
        df = leaguedashplayerclutch.LeagueDashPlayerClutch(
            season=season, season_type_all_star="Regular Season",
            per_mode_detailed="Totals", clutch_time="Last 5 Minutes",
            point_diff=5, measure_type_detailed_defense="Base", timeout=60,
        ).get_data_frames()[0]
        _sleep()
    except Exception as e:
        logger.warning("clutch stats failed for %s: %s", season, e)
        df = pd.DataFrame()
    _season_clutch_cache[season] = df
    return df


def _get_season_hustle(season: str) -> pd.DataFrame:
    if season < HUSTLE_ERA_CUTOFF:
        return pd.DataFrame()
    if season in _season_hustle_cache:
        return _season_hustle_cache[season]
    try:
        df = leaguehustlestatsplayer.LeagueHustleStatsPlayer(
            season=season, season_type_all_star="Regular Season",
            per_mode_time="Totals", timeout=60,
        ).get_data_frames()[0]
        _sleep()
    except Exception as e:
        logger.warning("hustle stats failed for %s: %s", season, e)
        df = pd.DataFrame()
    _season_hustle_cache[season] = df
    return df


def _get_season_bbref_advanced(season: str) -> pd.DataFrame:
    """Scrape Basketball-Reference's per-season Advanced table for real
    BPM/OBPM/DBPM/VORP/WS/WS48 — not available from nba_api."""
    if season in _season_bbref_cache:
        return _season_bbref_cache[season]
    year = _season_to_bbref_year(season)
    url = f"https://www.basketball-reference.com/leagues/NBA_{year}_advanced.html"
    try:
        resp = requests.get(url, headers=BBREF_HEADERS, timeout=20)
        resp.raise_for_status()
        tables = pd.read_html(StringIO(resp.text))
        df = tables[0]
        df = df[df["Player"] != "Player"].copy()
        df["Player"] = df["Player"].astype(str).str.replace(r"[*]", "", regex=True).str.strip()
        for col in ["OBPM", "DBPM", "BPM", "VORP", "WS", "WS/48"]:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors="coerce")
    except Exception as e:
        logger.warning("bbref advanced scrape failed for %s: %s", season, e)
        df = pd.DataFrame()
    time.sleep(0.5)
    _season_bbref_cache[season] = df
    return df


def _get_combine_data() -> pd.DataFrame:
    """Scrape Basketball-Reference combine pages once for all draft years —
    cheap (~25 page fetches total), shared across every curated player."""
    global _combine_cache
    if _combine_cache is not None:
        return _combine_cache

    frames = []
    for year in range(2000, 2025):
        url = f"https://www.basketball-reference.com/draft/NBA_{year}_combine.html"
        try:
            resp = requests.get(url, headers=BBREF_HEADERS, timeout=20)
            resp.raise_for_status()
            tables = pd.read_html(StringIO(resp.text))
            df = tables[0]
            df["DRAFT_YEAR"] = year
            frames.append(df)
        except Exception as e:
            logger.debug("combine scrape failed for %s: %s", year, e)
        time.sleep(0.4)

    out = pd.concat(frames, ignore_index=True) if frames else pd.DataFrame()
    rename_map = {}
    for c in out.columns:
        cl = str(c).lower()
        if "height" in cl and "shoe" in cl:
            rename_map[c] = "height_no_shoes"
        elif "wingspan" in cl:
            rename_map[c] = "wingspan"
        elif "reach" in cl:
            rename_map[c] = "standing_reach"
        elif "vert" in cl and "max" in cl:
            rename_map[c] = "max_vertical"
        elif "lane agil" in cl:
            rename_map[c] = "lane_agility_time"
        elif "sprint" in cl:
            rename_map[c] = "sprint_time"
        elif cl == "player":
            rename_map[c] = "player_name_combine"
    out = out.rename(columns=rename_map)
    for col in ["wingspan", "height_no_shoes", "standing_reach", "max_vertical",
                "lane_agility_time", "sprint_time"]:
        if col in out.columns:
            out[col] = pd.to_numeric(out[col], errors="coerce")
    if "wingspan" in out.columns and "height_no_shoes" in out.columns:
        out["wingspan_minus_height"] = out["wingspan"] - out["height_no_shoes"]

    _combine_cache = out
    return out


# ─────────────────────────────────────────────────────────────────────────────
# Per-player-season pulls (career stats, shot chart) + feature computation
# ─────────────────────────────────────────────────────────────────────────────

def _fetch_shot_zone_features(player_id: int, season: str) -> dict:
    try:
        df = shotchartdetail.ShotChartDetail(
            team_id=0, player_id=player_id, season_nullable=season,
            season_type_all_star="Regular Season", context_measure_simple="FGA",
            timeout=60,
        ).get_data_frames()[0]
        _sleep()
    except Exception as e:
        logger.debug("shot chart failed for %s %s: %s", player_id, season, e)
        return {}

    if df.empty:
        return {}

    total = len(df)

    def zone_stats(mask):
        sub = df[mask]
        n = len(sub)
        made = sub["SHOT_MADE_FLAG"].sum() if n else 0
        return (made / n if n else None), n

    ra_pct, ra_n   = zone_stats(df["SHOT_ZONE_BASIC"] == "Restricted Area")
    mid_pct, mid_n = zone_stats(df["SHOT_ZONE_BASIC"] == "Mid-Range")
    lc3_n = (df["SHOT_ZONE_BASIC"] == "Left Corner 3").sum()
    rc3_n = (df["SHOT_ZONE_BASIC"] == "Right Corner 3").sum()
    corner3_n = lc3_n + rc3_n
    corner3_made = df[df["SHOT_ZONE_BASIC"].isin(["Left Corner 3", "Right Corner 3"])]["SHOT_MADE_FLAG"].sum()
    corner3_pct = corner3_made / corner3_n if corner3_n else None

    three_n = df["SHOT_ZONE_BASIC"].isin(
        ["Left Corner 3", "Right Corner 3", "Above the Break 3"]
    ).sum()

    floater_mask = df["ACTION_TYPE"].astype(str).str.contains("Floating", case=False, na=False)
    floater_n = floater_mask.sum()
    floater_made = df[floater_mask]["SHOT_MADE_FLAG"].sum()
    floater_pct = floater_made / floater_n if floater_n else None

    dunk_mask = df["ACTION_TYPE"].astype(str).str.contains("Dunk", case=False, na=False)
    dunk_n = dunk_mask.sum()

    return {
        "restricted_area_fg_pct": ra_pct,
        "midrange_fg_pct": mid_pct,
        "corner_3_pct": corner3_pct,
        "rim_attempt_rate": ra_n / total,
        "midrange_attempt_rate": mid_n / total,
        "three_rate": three_n / total,
        "corner_3_frequency": (corner3_n / three_n) if three_n else None,
        "floater_attempt_rate": floater_n / total,
        "short_midrange_fg_pct": floater_pct,
        "dunk_pct_of_fga": dunk_n / total,
    }


def _compute_career_features(row: dict) -> Optional[dict]:
    """Per-36 + efficiency stats from a single career-stats season row (totals)."""
    gp  = _safe(row.get("GP", 0))
    min_total = _safe(row.get("MIN", 0))
    pts = _safe(row.get("PTS", 0))
    ast = _safe(row.get("AST", 0))
    reb = _safe(row.get("REB", 0))
    stl = _safe(row.get("STL", 0))
    blk = _safe(row.get("BLK", 0))
    tov = _safe(row.get("TOV", 0))
    fga = _safe(row.get("FGA", 0))
    fgm = _safe(row.get("FGM", 0))
    fg3a = _safe(row.get("FG3A", 0))
    fg3m = _safe(row.get("FG3M", 0))
    fta  = _safe(row.get("FTA", 0))
    ftm  = _safe(row.get("FTM", 0))

    if min_total < 50 or gp < 5 or fga < 10:
        return None

    def per36(x):
        return (x / min_total) * 36

    ts = pts / (2 * (fga + 0.44 * fta)) if (fga + 0.44 * fta) > 0 else 0.0
    efg = (fgm + 0.5 * fg3m) / fga if fga > 0 else 0.0
    ftr = fta / fga if fga > 0 else 0.0
    three_rate_basic = fg3a / fga if fga > 0 else 0.0
    three_pct = fg3m / fg3a if fg3a > 0 else 0.0
    ft_pct = ftm / fta if fta > 0 else 0.0
    ast_tov = ast / tov if tov > 0 else (5.0 if ast > 0 else 0.0)

    return {
        "points_per36": per36(pts), "assists_per36": per36(ast),
        "rebounds_per36": per36(reb), "steals_per36": per36(stl),
        "blocks_per36": per36(blk), "turnovers_per36": per36(tov),
        "ts_pct": ts, "efg_pct": efg, "ftr": ftr,
        "three_rate_basic": three_rate_basic, "three_pct": three_pct,
        "ft_pct": ft_pct, "ast_to_ratio": min(ast_tov, 10.0),
        "min_per_game": min_total / gp,
    }


def _build_player_entries(name: str) -> list[dict]:
    results = static_players.find_players_by_full_name(name)
    if not results:
        logger.warning("Player not found: %s", name)
        return []
    player_id = results[0]["id"]

    try:
        info_df = commonplayerinfo.CommonPlayerInfo(player_id=player_id, timeout=60).get_data_frames()[0]
        _sleep()
        pos_str = str(info_df.iloc[0].get("POSITION", "")) if not info_df.empty else ""
        pos_numeric = _position_numeric(pos_str)
    except Exception:
        pos_numeric = 3.0
        pos_str = ""

    try:
        career = playercareerstats.PlayerCareerStats(player_id=player_id, timeout=60).get_data_frames()[0]
        _sleep()
    except Exception as e:
        logger.warning("career stats failed for %s: %s", name, e)
        return []

    if career.empty:
        return []

    pts_by_age, ast_by_age, reb_by_age = {}, {}, {}
    for _, r in career.iterrows():
        age = int(_safe(r.get("PLAYER_AGE", 0)))
        gp  = _safe(r.get("GP", 0))
        mn  = _safe(r.get("MIN", 0))
        if age > 0 and gp >= 5 and mn >= 50:
            pts_by_age[age] = round(_safe(r.get("PTS", 0)) / gp, 1)
            ast_by_age[age] = round(_safe(r.get("AST", 0)) / gp, 1)
            reb_by_age[age] = round(_safe(r.get("REB", 0)) / gp, 1)

    combine_df = _get_combine_data()
    combine_row = None
    if not combine_df.empty and "player_name_combine" in combine_df.columns:
        match = combine_df[combine_df["player_name_combine"].astype(str).str.strip() == name]
        if not match.empty:
            combine_row = match.iloc[0].to_dict()

    entries = []
    for _, row in career.iterrows():
        age = int(_safe(row.get("PLAYER_AGE", 0)))
        season = str(row.get("SEASON_ID", ""))
        if age < 18 or age > 40 or not season:
            continue

        feats = _compute_career_features(row.to_dict())
        if feats is None:
            continue

        adv_df = _get_season_advanced(season)
        adv_row = {}
        if not adv_df.empty:
            m = adv_df[adv_df["PLAYER_ID"] == player_id]
            if not m.empty:
                adv_row = m.iloc[0].to_dict()

        clutch_df = _get_season_clutch(season)
        clutch_row = {}
        if not clutch_df.empty:
            m = clutch_df[clutch_df["PLAYER_ID"] == player_id]
            if not m.empty:
                clutch_row = m.iloc[0].to_dict()

        hustle_df = _get_season_hustle(season)
        hustle_row = {}
        if not hustle_df.empty:
            m = hustle_df[hustle_df["PLAYER_ID"] == player_id]
            if not m.empty:
                hustle_row = m.iloc[0].to_dict()

        bbref_df = _get_season_bbref_advanced(season)
        bbref_row = {}
        if not bbref_df.empty:
            m = bbref_df[bbref_df["Player"].astype(str).str.strip() == name]
            if not m.empty:
                bbref_row = m.iloc[0].to_dict()

        zone_feats = _fetch_shot_zone_features(player_id, season)

        merged = {
            **feats, **zone_feats,
            "usage_pct": _safe(adv_row.get("USG_PCT")) if adv_row else None,
            "ast_pct": _safe(adv_row.get("AST_PCT")) if adv_row else None,
            "stl_pct": _safe(adv_row.get("STL_PCT")) if adv_row else None,
            "blk_pct": _safe(adv_row.get("BLK_PCT")) if adv_row else None,
            "oreb_pct": _safe(adv_row.get("OREB_PCT")) if adv_row else None,
            "dreb_pct": _safe(adv_row.get("DREB_PCT")) if adv_row else None,
            "treb_pct": _safe(adv_row.get("REB_PCT")) if adv_row else None,
            "clutch_fg_pct": _safe(clutch_row.get("FG_PCT")) if clutch_row else None,
            "clutch_usage_rate": None,  # not in Base clutch pull
            "clutch_points_per36": (
                (_safe(clutch_row.get("PTS")) / _safe(clutch_row.get("MIN"), 1)) * 36
                if clutch_row and _safe(clutch_row.get("MIN")) > 0 else None
            ),
            "deflections_per36": (
                (_safe(hustle_row.get("DEFLECTIONS")) / _safe(hustle_row.get("MIN"), 1)) * 36
                if hustle_row and _safe(hustle_row.get("MIN")) > 0 else None
            ),
            "charges_drawn": _safe(hustle_row.get("CHARGES_DRAWN")) if hustle_row else None,
            "loose_balls_recovered": _safe(hustle_row.get("LOOSE_BALLS_RECOVERED")) if hustle_row else None,
            "screen_assists": _safe(hustle_row.get("SCREEN_ASSISTS")) if hustle_row else None,
            "bpm": _safe(bbref_row.get("BPM")) if bbref_row else None,
            "dbpm": _safe(bbref_row.get("DBPM")) if bbref_row else None,
            "vorp": _safe(bbref_row.get("VORP")) if bbref_row else None,
            "ws_per_48": _safe(bbref_row.get("WS/48")) if bbref_row else None,
            "max_vertical": _safe(combine_row.get("max_vertical")) if combine_row else None,
            "wingspan_minus_height": _safe(combine_row.get("wingspan_minus_height")) if combine_row else None,
            "standing_reach": _safe(combine_row.get("standing_reach")) if combine_row else None,
            "lane_agility_time": _safe(combine_row.get("lane_agility_time")) if combine_row else None,
            "sprint_time": _safe(combine_row.get("sprint_time")) if combine_row else None,
            "position_str": pos_str,
        }
        # convert any 0.0-from-_safe placeholders for genuinely missing data back to None
        for k in list(merged.keys()):
            if merged[k] == 0.0 and k not in (
                "rim_attempt_rate", "midrange_attempt_rate", "three_rate",
                "floater_attempt_rate", "dunk_pct_of_fga",
            ):
                # ambiguous zero vs missing — leave as-is; badge funcs check None via dict.get
                pass

        career_feature_vec = [
            merged.get("points_per36", 0), merged.get("assists_per36", 0),
            merged.get("rebounds_per36", 0), merged.get("steals_per36", 0),
            merged.get("blocks_per36", 0), merged.get("turnovers_per36", 0),
            merged.get("ts_pct", 0), merged.get("efg_pct", 0), merged.get("ftr", 0),
            merged.get("ast_pct") or 0, merged.get("stl_pct") or 0, merged.get("blk_pct") or 0,
            merged.get("oreb_pct") or 0, merged.get("dreb_pct") or 0, merged.get("usage_pct") or 0,
            merged.get("three_rate", 0), merged.get("rim_attempt_rate", 0),
            merged.get("midrange_attempt_rate", 0),
            # Position included twice: it's the primary signal separating
            # archetype names (e.g. "Passing Big" vs "Pass First Point Guard")
            # and box-score stats alone don't reliably separate playmaking
            # guards from playmaking bigs after scaling.
            pos_numeric, pos_numeric,
        ]

        entries.append({
            "player_id": player_id,
            "player_name": name,
            "age": age,
            "season": season,
            "position_numeric": pos_numeric,
            "stats": merged,
            "cluster_features": career_feature_vec,
            "pts_by_age": pts_by_age,
            "ast_by_age": ast_by_age,
            "reb_by_age": reb_by_age,
        })

    return entries


# ─────────────────────────────────────────────────────────────────────────────
# Badge system — 16 of 28 computable from live-pulled data (see module docstring)
# ─────────────────────────────────────────────────────────────────────────────

BADGE_TIER_POINTS = {"Gold": 3, "Silver": 2, "Bronze": 1}


def _g(stats: dict, key):
    v = stats.get(key)
    if v is None or (isinstance(v, float) and not math.isfinite(v)):
        return None
    return v


def _need(stats: dict, *keys):
    vals = [_g(stats, k) for k in keys]
    return None if any(v is None for v in vals) else vals


def badge_rim_finisher(s):
    v = _need(s, "rim_attempt_rate", "restricted_area_fg_pct")
    if v is None:
        return None
    rate, pct = v
    if not (rate > 0.30 and pct > 0.65):
        return None
    if pct > 0.75:
        return "Gold"
    if pct > 0.70:
        return "Silver"
    return "Bronze"


def badge_contact_finisher(s):
    v = _need(s, "ftr", "ft_pct")
    if v is None:
        return None
    rate, ft_pct = v
    if not (rate > 0.35 and ft_pct > 0.72):
        return None
    if rate > 0.55 and ft_pct > 0.78:
        return "Gold"
    if rate > 0.45:
        return "Silver"
    return "Bronze"


def badge_athletic_dunker(s):
    v = _need(s, "dunk_pct_of_fga", "max_vertical")
    if v is None:
        return None
    dunk_pct, max_vert = v
    if not (dunk_pct > 0.12 and max_vert > 36):
        return None
    if dunk_pct > 0.25 and max_vert > 40:
        return "Gold"
    if dunk_pct > 0.18:
        return "Silver"
    return "Bronze"


def badge_floater_specialist(s):
    v = _need(s, "floater_attempt_rate", "short_midrange_fg_pct")
    if v is None:
        return None
    rate, pct = v
    if not (rate > 0.06 and pct > 0.44):
        return None
    if pct > 0.52:
        return "Gold"
    if pct > 0.48:
        return "Silver"
    return "Bronze"


def badge_corner_three_specialist(s):
    v = _need(s, "corner_3_frequency", "corner_3_pct")
    if v is None:
        return None
    freq, pct = v
    if not (freq > 0.25 and pct > 0.38):
        return None
    if pct > 0.44:
        return "Gold"
    if pct > 0.41:
        return "Silver"
    return "Bronze"


def badge_volume_scorer(s):
    v = _need(s, "usage_pct", "points_per36")
    if v is None:
        return None
    usg, pts36 = v
    if not (usg > 0.24 and pts36 > 20):
        return None
    if usg > 0.32:
        return "Gold"
    if usg > 0.28:
        return "Silver"
    return "Bronze"


def badge_clutch_scorer(s):
    v = _need(s, "clutch_fg_pct", "ts_pct")
    if v is None:
        return None
    clutch_fg, career_fg = v
    if clutch_fg < career_fg:
        return None
    pts36 = _g(s, "clutch_points_per36")
    if pts36 is None:
        return "Bronze"
    if pts36 > 28 and clutch_fg > career_fg + 0.02:
        return "Gold"
    if pts36 > 22:
        return "Silver"
    return "Bronze"


def badge_midrange_assassin(s):
    v = _need(s, "midrange_attempt_rate", "midrange_fg_pct")
    if v is None:
        return None
    rate, pct = v
    if not (rate > 0.20 and pct > 0.46):
        return None
    if pct > 0.52:
        return "Gold"
    if pct > 0.49:
        return "Silver"
    return "Bronze"


def badge_primary_playmaker(s):
    v = _need(s, "ast_pct", "ast_to_ratio")
    if v is None:
        return None
    ast_pct, ast_to = v
    if not (ast_pct > 0.28 and ast_to > 2.5):
        return None
    if ast_pct > 0.38:
        return "Gold"
    if ast_pct > 0.33:
        return "Silver"
    return "Bronze"


def badge_help_side_defender(s):
    v = _need(s, "deflections_per36", "dbpm")
    if v is None:
        return None
    defl, dbpm = v
    if not (defl > 3.5 and dbpm > 1.0):
        return None
    if defl > 5.5:
        return "Gold"
    if defl > 4.5:
        return "Silver"
    return "Bronze"


def badge_passing_lane_interceptor(s):
    v = _need(s, "stl_pct", "deflections_per36")
    if v is None:
        return None
    stl_pct, defl = v
    if not (stl_pct > 0.025 and defl > 4.0):
        return None
    if stl_pct > 0.035:
        return "Gold"
    if stl_pct > 0.030:
        return "Silver"
    return "Bronze"


def badge_offensive_glass_crasher(s):
    pct = _g(s, "oreb_pct")
    if pct is None or pct <= 0.10:
        return None
    if pct > 0.16:
        return "Gold"
    if pct > 0.13:
        return "Silver"
    return "Bronze"


def badge_defensive_rebounding_anchor(s):
    pct = _g(s, "dreb_pct")
    if pct is None or pct <= 0.22:
        return None
    if pct > 0.30:
        return "Gold"
    if pct > 0.26:
        return "Silver"
    return "Bronze"


def badge_rebounding_wing(s):
    v = _need(s, "treb_pct", "position_str")
    if v is None:
        return None
    pct, position = v
    pos_str = str(position)
    is_sg_sf = pos_str in ("Guard", "Forward") or ("Guard" in pos_str and "Forward" in pos_str)
    if not is_sg_sf or pct <= 0.12:
        return None
    if pct > 0.16:
        return "Gold"
    if pct > 0.14:
        return "Silver"
    return "Bronze"


def badge_elite_athlete(s):
    v = _need(s, "max_vertical", "lane_agility_time", "sprint_time")
    if v is None:
        return None
    vert, agility, sprint = v
    if not (vert > 38 and agility < 10.5 and sprint < 3.2):
        return None
    if vert > 42:
        return "Gold"
    if vert > 40:
        return "Silver"
    return "Bronze"


def badge_length_and_versatility(s, position_avg_reach=None):
    v = _need(s, "wingspan_minus_height", "standing_reach")
    if v is None or position_avg_reach is None:
        return None
    wmh, reach = v
    if not (wmh > 4 and reach > position_avg_reach + 3):
        return None
    if wmh > 8:
        return "Gold"
    if wmh > 6:
        return "Silver"
    return "Bronze"


def badge_high_motor(s, league_avg_loose_balls=None, league_avg_screen_assists=None):
    v = _need(s, "charges_drawn", "loose_balls_recovered", "screen_assists")
    if v is None or league_avg_loose_balls is None or league_avg_screen_assists is None:
        return None
    charges, loose_balls, screens = v
    if not (charges > 15 and loose_balls > league_avg_loose_balls and screens > league_avg_screen_assists):
        return None
    if charges > 35:
        return "Gold"
    if charges > 25:
        return "Silver"
    return "Bronze"


BADGE_FUNCTIONS = {
    "Rim Finisher": badge_rim_finisher,
    "Contact Finisher": badge_contact_finisher,
    "Athletic Dunker": badge_athletic_dunker,
    "Floater Specialist": badge_floater_specialist,
    "Corner Three Specialist": badge_corner_three_specialist,
    "Volume Scorer": badge_volume_scorer,
    "Clutch Scorer": badge_clutch_scorer,
    "Mid Range Assassin": badge_midrange_assassin,
    "Primary Playmaker": badge_primary_playmaker,
    "Help Side Defender": badge_help_side_defender,
    "Passing Lane Interceptor": badge_passing_lane_interceptor,
    "Offensive Glass Crasher": badge_offensive_glass_crasher,
    "Defensive Rebounding Anchor": badge_defensive_rebounding_anchor,
    "Rebounding Wing": badge_rebounding_wing,
    "Elite Athlete": badge_elite_athlete,
    "Length and Versatility": badge_length_and_versatility,
    "High Motor": badge_high_motor,
}
BADGE_COLUMNS = list(BADGE_FUNCTIONS.keys())

UNAVAILABLE_BADGES = [
    "Post Scorer", "Spot Up Shooter", "Off Screen Shooter", "Pull Up Shooter",
    "Secondary Playmaker", "Pick and Roll Maestro", "Transition Initiator",
    "Lob Threat", "Perimeter Lockdown", "Rim Protector", "Physical Post Defender",
    "Switchable Defender",
]  # need synergy / tracking / matchups — Colab-only


def evaluate_badges(stats: dict, position_avg_reach=None, league_avg_loose_balls=None,
                     league_avg_screen_assists=None) -> dict:
    out = {}
    for name, fn in BADGE_FUNCTIONS.items():
        if name == "Length and Versatility":
            out[name] = fn(stats, position_avg_reach=position_avg_reach)
        elif name == "High Motor":
            out[name] = fn(stats, league_avg_loose_balls=league_avg_loose_balls,
                            league_avg_screen_assists=league_avg_screen_assists)
        else:
            out[name] = fn(stats)
    return out


# ─────────────────────────────────────────────────────────────────────────────
# Archetype clustering — KMeans(20), labeled by reference-player majority vote
# ─────────────────────────────────────────────────────────────────────────────

def _assign_archetypes(entries: list[dict]) -> dict[int, str]:
    """Cluster every entry's career_features vector into 20 groups, then name
    each cluster after whichever reference players land in it most. Returns
    {entry_index: archetype_name}."""
    if len(entries) < N_ARCHETYPES * 2:
        return {i: "Versatile Forward" for i in range(len(entries))}

    X = np.array([e["cluster_features"] for e in entries], dtype=float)
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    kmeans = KMeans(n_clusters=N_ARCHETYPES, random_state=42, n_init=10)
    labels = kmeans.fit_predict(X_scaled)

    name_to_archetypes = {}
    for arch, names in REFERENCE_PLAYERS.items():
        for n in names:
            name_to_archetypes.setdefault(n, []).append(arch)

    cluster_votes: dict[int, dict[str, int]] = {i: {} for i in range(N_ARCHETYPES)}
    for entry, cluster in zip(entries, labels):
        intended = name_to_archetypes.get(entry["player_name"])
        if not intended:
            continue
        for arch in intended:
            cluster_votes[cluster][arch] = cluster_votes[cluster].get(arch, 0) + 1

    # Deferred-acceptance naming: each cluster's TOP preference is its own
    # most-voted archetype (not whatever has the highest vote count globally).
    # Conflicts — two clusters both wanting the same name — are resolved by
    # comparing actual vote strength for that specific archetype, so a
    # strongly-PG cluster can't be renamed "Passing Big" just because Jokic/
    # Sabonis/Gasol happen to generate a bigger raw vote count elsewhere.
    cluster_prefs = {
        cl: sorted(votes.items(), key=lambda kv: -kv[1])
        for cl, votes in cluster_votes.items()
    }
    pointer = {cl: 0 for cl in range(N_ARCHETYPES)}
    cluster_to_archetype: dict[int, str] = {}
    used: set[str] = set()
    pending = list(range(N_ARCHETYPES))

    while pending:
        proposals: dict[str, list[tuple[int, int]]] = {}
        no_more_prefs = []
        for cl in pending:
            prefs = cluster_prefs.get(cl, [])
            while pointer[cl] < len(prefs) and prefs[pointer[cl]][0] in used:
                pointer[cl] += 1
            if pointer[cl] < len(prefs):
                arch, votes = prefs[pointer[cl]]
                proposals.setdefault(arch, []).append((cl, votes))
            else:
                no_more_prefs.append(cl)

        if not proposals:
            break

        next_pending = list(no_more_prefs)
        for arch, claimants in proposals.items():
            claimants.sort(key=lambda x: -x[1])
            winner_cl, _ = claimants[0]
            cluster_to_archetype[winner_cl] = arch
            used.add(arch)
            for cl, _ in claimants[1:]:
                pointer[cl] += 1
                next_pending.append(cl)
        pending = [cl for cl in next_pending if cl not in cluster_to_archetype]

    remaining = [a for a in ARCHETYPE_NAMES if a not in used]
    for cl in range(N_ARCHETYPES):
        if cl not in cluster_to_archetype and remaining:
            cluster_to_archetype[cl] = remaining.pop(0)

    return {i: cluster_to_archetype[label] for i, label in enumerate(labels)}


def _assign_archetypes_nearest_anchor(entries: list[dict], scaler: StandardScaler) -> dict[int, str]:
    """Assign each player-season the archetype of the nearest reference-player
    'anchor' in scaled feature space.

    Far more reliable than KMeans+naming for a small curated set: each
    archetype is anchored by the actual reference players the spec assigns to
    it (Curry/Lillard/Young → Scoring Point Guard, etc.), and every player is
    matched to whichever anchor archetype is closest. Reference players almost
    always land on their own archetype because they help define its centroid.
    """
    name_to_archetypes: dict[str, list[str]] = {}
    for arch, names in REFERENCE_PLAYERS.items():
        for n in names:
            name_to_archetypes.setdefault(n, []).append(arch)

    X_all = scaler.transform(np.array([e["cluster_features"] for e in entries], dtype=float))

    # Career-average scaled vector per player
    player_vecs: dict[str, list] = {}
    for vec, e in zip(X_all, entries):
        player_vecs.setdefault(e["player_name"], []).append(vec)
    player_mean = {n: np.mean(v, axis=0) for n, v in player_vecs.items()}

    # Archetype centroid = mean of its reference players that exist in the DB
    arch_anchor_vecs: dict[str, list] = {}
    for name, archs in name_to_archetypes.items():
        if name in player_mean:
            for a in archs:
                arch_anchor_vecs.setdefault(a, []).append(player_mean[name])

    arch_names = list(arch_anchor_vecs.keys())
    centroids = np.array([np.mean(arch_anchor_vecs[a], axis=0) for a in arch_names])

    logger.info("Nearest-anchor archetypes available: %s", arch_names)

    result: dict[int, str] = {}
    for i, vec in enumerate(X_all):
        dists = np.linalg.norm(centroids - vec, axis=1)
        result[i] = arch_names[int(np.argmin(dists))]
    return result


# ─────────────────────────────────────────────────────────────────────────────
# Two-layer similarity: archetype match (0.40) + badge overlap (0.60) * age penalty
# ─────────────────────────────────────────────────────────────────────────────

def _archetype_score(a: Optional[str], b: Optional[str]) -> float:
    if a is None or b is None:
        return 0.1
    if a == b:
        return 1.0
    if frozenset([a, b]) in ADJACENT_ARCHETYPES:
        return 0.6
    return 0.1


def _badge_overlap_score(badges_a: dict, badges_b: dict) -> float:
    points, max_possible = 0, 0
    for badge in BADGE_COLUMNS:
        tier_a, tier_b = badges_a.get(badge), badges_b.get(badge)
        if tier_a is not None:
            max_possible += BADGE_TIER_POINTS[tier_a]
        if tier_a is not None and tier_b is not None:
            points += min(BADGE_TIER_POINTS[tier_a], BADGE_TIER_POINTS[tier_b])
    return points / max_possible if max_possible > 0 else 0.0


def _age_penalty(age_diff: float) -> float:
    age_diff = abs(age_diff)
    if age_diff <= 1:
        return 1.0
    if age_diff <= 2:
        return 0.85
    if age_diff <= 3:
        return 0.70
    return 0.50


# ─────────────────────────────────────────────────────────────────────────────
# Build / load / lazy init
# ─────────────────────────────────────────────────────────────────────────────

_db: Optional[dict] = None
_db_lock = threading.Lock()
_build_thread: Optional[threading.Thread] = None
_build_error: Optional[str] = None
_is_building = False


def get_status() -> dict:
    return {
        "ready": _db is not None,
        "is_building": _is_building,
        "error": _build_error,
        "n_entries": _db["n_entries"] if _db else 0,
        "n_players": _db["n_players"] if _db else 0,
        "db_path": str(DB_PATH),
        "badges_available": BADGE_COLUMNS,
        "badges_unavailable_live": UNAVAILABLE_BADGES,
    }


def build_database() -> dict:
    logger.info("Building two-layer comp database for %d players…", len(CURATED_PLAYERS))
    all_entries: list[dict] = []

    for i, name in enumerate(CURATED_PLAYERS):
        logger.info("[%d/%d] %s", i + 1, len(CURATED_PLAYERS), name)
        try:
            all_entries.extend(_build_player_entries(name))
        except Exception as e:
            logger.warning("Skipping %s: %s", name, e)

    if not all_entries:
        raise RuntimeError("No entries built — check NBA API connectivity")

    # League averages for context-dependent badges
    loose_balls_vals = [e["stats"].get("loose_balls_recovered") for e in all_entries
                         if e["stats"].get("loose_balls_recovered") is not None]
    screen_assist_vals = [e["stats"].get("screen_assists") for e in all_entries
                           if e["stats"].get("screen_assists") is not None]
    league_avg_loose_balls = sum(loose_balls_vals) / len(loose_balls_vals) if loose_balls_vals else None
    league_avg_screen_assists = sum(screen_assist_vals) / len(screen_assist_vals) if screen_assist_vals else None

    reach_by_pos: dict[float, list[float]] = {}
    for e in all_entries:
        reach = e["stats"].get("standing_reach")
        if reach is not None:
            reach_by_pos.setdefault(e["position_numeric"], []).append(reach)
    pos_avg_reach = {pos: sum(v) / len(v) for pos, v in reach_by_pos.items()}

    # Badges per entry
    for e in all_entries:
        e["badges"] = evaluate_badges(
            e["stats"],
            position_avg_reach=pos_avg_reach.get(e["position_numeric"]),
            league_avg_loose_balls=league_avg_loose_balls,
            league_avg_screen_assists=league_avg_screen_assists,
        )

    # Scaler over the cluster features (fit first — archetype assignment needs it)
    X = np.array([e["cluster_features"] for e in all_entries], dtype=float)
    scaler = StandardScaler()
    scaler.fit(X)

    # Archetypes via nearest reference-player anchor
    archetype_map = _assign_archetypes_nearest_anchor(all_entries, scaler)
    for i, e in enumerate(all_entries):
        e["archetype"] = archetype_map.get(i, "Versatile Forward")

    db = {
        "entries": all_entries,
        "scaler": scaler,
        "built_at": time.time(),
        "n_players": len(set(e["player_name"] for e in all_entries)),
        "n_entries": len(all_entries),
    }

    with open(DB_PATH, "wb") as f:
        pickle.dump(db, f)

    logger.info("Comp DB built: %d entries from %d players", len(all_entries), db["n_players"])
    return db


def _load_from_disk() -> Optional[dict]:
    if not DB_PATH.exists():
        return None
    age_days = (time.time() - DB_PATH.stat().st_mtime) / 86400
    if age_days > DB_MAX_AGE_DAYS:
        logger.info("Comp DB is %d days old — will rebuild", int(age_days))
        return None
    try:
        with open(DB_PATH, "rb") as f:
            db = pickle.load(f)
        logger.info("Loaded comp DB: %d entries", db.get("n_entries", 0))
        return db
    except Exception as e:
        logger.warning("Could not load comp DB from disk: %s", e)
        return None


def _jsonable(v):
    """Coerce a value (incl. numpy scalars) to a JSON-serializable form."""
    if v is None:
        return None
    if isinstance(v, (bool, str)):
        return v
    if isinstance(v, (int, np.integer)):
        return int(v)
    if isinstance(v, (float, np.floating)):
        f = float(v)
        return f if math.isfinite(f) else None
    return v


def export_entries_json(path: Path = COMP_ENTRIES_JSON) -> int:
    """Write the loaded comp DB's entries to a portable JSON snapshot.
    Drops the sklearn scaler (not needed to serve curated players, and not
    portable). Run locally after a build; the JSON is committed + shipped."""
    db = _db or _load_from_disk()
    if db is None:
        raise RuntimeError("No comp DB loaded/on disk to export. Build it first.")

    clean = []
    for e in db["entries"]:
        clean.append({
            "player_id": int(e["player_id"]),
            "player_name": e["player_name"],
            "age": int(e["age"]),
            "season": e["season"],
            "position_numeric": float(e["position_numeric"]),
            "archetype": e.get("archetype"),
            "stats": {k: _jsonable(v) for k, v in e["stats"].items()},
            "badges": e.get("badges", {}),
            "pts_by_age": {str(k): _jsonable(v) for k, v in e["pts_by_age"].items()},
            "ast_by_age": {str(k): _jsonable(v) for k, v in e["ast_by_age"].items()},
            "reb_by_age": {str(k): _jsonable(v) for k, v in e["reb_by_age"].items()},
            "cluster_features": [_jsonable(x) for x in e["cluster_features"]],
        })

    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "entries": clean,
        "n_entries": len(clean),
        "n_players": len(set(e["player_name"] for e in clean)),
        "built_at": time.time(),
    }
    path.write_text(json.dumps(payload), encoding="utf-8")
    return len(clean)


def _load_entries_json() -> Optional[dict]:
    """Load the committed JSON entries snapshot (used on the cloud, where the
    pickle isn't available and NBA can't be reached to rebuild). Converts the
    age-keyed dicts back to int keys (JSON stringifies them)."""
    if not COMP_ENTRIES_JSON.exists():
        return None
    try:
        payload = json.loads(COMP_ENTRIES_JSON.read_text(encoding="utf-8"))
    except Exception as e:
        logger.warning("Could not load comp entries JSON: %s", e)
        return None

    for e in payload["entries"]:
        for key in ("pts_by_age", "ast_by_age", "reb_by_age"):
            e[key] = {int(k): v for k, v in e.get(key, {}).items()}

    logger.info("Loaded comp entries JSON: %d entries", payload.get("n_entries", 0))
    return {
        "entries": payload["entries"],
        "scaler": None,  # not shipped; only needed for live (local) archetype assignment
        "n_entries": payload.get("n_entries", len(payload["entries"])),
        "n_players": payload.get("n_players", 0),
    }


def get_player_entries(player_id: Optional[int] = None, name: Optional[str] = None) -> list[dict]:
    """Return all comp-DB entries (seasons) for a player already in the database,
    matched by id or name. Empty if the player isn't curated."""
    if _db is None:
        return []
    out = []
    for e in _db["entries"]:
        if player_id is not None and e["player_id"] == player_id:
            out.append(e)
        elif name is not None and e["player_name"].lower() == name.lower():
            out.append(e)
    return out


def _background_build():
    global _db, _is_building, _build_error
    _is_building = True
    _build_error = None
    try:
        db = build_database()
        with _db_lock:
            _db = db
    except Exception as e:
        _build_error = str(e)
        logger.error("Comp DB build failed: %s", e)
    finally:
        _is_building = False


def init_database_async():
    global _db, _build_thread, _is_building
    from app import data_cache

    # 1. Local fresh pickle (full DB incl. scaler)
    db = _load_from_disk()
    if db is not None:
        _db = db
        return

    # 2. Committed JSON snapshot — used on the cloud (NBA blocked, no pickle)
    db = _load_entries_json()
    if db is not None:
        _db = db
        return

    # 3. Build live — only possible where NBA is reachable (local). The cloud
    #    can't build (blocked IP + 30-60 min), so it relies on the JSON above.
    if data_cache.IS_CLOUD:
        logger.warning("On cloud with no comp snapshot — Trajectory limited to none. "
                       "Run precompute.py locally and commit data_cache/comp_entries.json.")
        return
    if _is_building:
        return
    logger.info("Starting background comp DB build…")
    _build_thread = threading.Thread(target=_background_build, daemon=True)
    _build_thread.start()


def get_database() -> Optional[dict]:
    return _db


# ─────────────────────────────────────────────────────────────────────────────
# Public search API
# ─────────────────────────────────────────────────────────────────────────────

def find_comparables(
    query_stats: dict,
    query_archetype: Optional[str],
    query_age: int,
    k: int = 5,
    exclude_player_id: Optional[int] = None,
    exclude_player_name: Optional[str] = None,
) -> list[dict]:
    """
    Two-layer similarity search: (archetype_score * 0.40 + badge_overlap * 0.60)
    * age_penalty. One comp per player, highest-similarity season kept.
    """
    db = _db
    if db is None:
        return []

    entries = db["entries"]
    if exclude_player_id is not None:
        entries = [e for e in entries if e["player_id"] != exclude_player_id]
    if exclude_player_name is not None:
        entries = [e for e in entries if e["player_name"].lower() != exclude_player_name.lower()]

    query_badges = evaluate_badges(query_stats)

    scored = []
    for e in entries:
        arch_score = _archetype_score(query_archetype, e["archetype"])
        badge_score = _badge_overlap_score(query_badges, e["badges"])
        penalty = _age_penalty(e["age"] - query_age)
        similarity = (arch_score * 0.40 + badge_score * 0.60) * penalty
        scored.append({
            "player_name": e["player_name"],
            "player_id": e["player_id"],
            "matched_age": e["age"],
            "archetype": e["archetype"],
            "badges": {b: t for b, t in e["badges"].items() if t is not None},
            "similarity": round(similarity, 4),
            "pts_by_age": e["pts_by_age"],
            "ast_by_age": e["ast_by_age"],
            "reb_by_age": e["reb_by_age"],
        })

    scored.sort(key=lambda x: -x["similarity"])

    seen = set()
    deduped = []
    for s in scored:
        if s["player_name"] in seen:
            continue
        seen.add(s["player_name"])
        deduped.append(s)
        if len(deduped) >= k:
            break

    return deduped


def compute_query_archetype_and_stats(player_id: int, name: str) -> tuple[Optional[str], dict, int]:
    """Build the same stats dict + archetype for an arbitrary (non-curated)
    player, so they can be matched against the curated comp database."""
    entries = _build_player_entries(name)
    if not entries:
        return None, {}, 0

    latest = max(entries, key=lambda e: e["age"])
    db = _db
    if db is None:
        return None, latest["stats"], latest["age"]

    # Assign archetype via nearest centroid in the existing scaled feature space
    scaler: StandardScaler = db["scaler"]
    q_scaled = scaler.transform(np.array(latest["cluster_features"], dtype=float).reshape(1, -1))
    db_entries = db["entries"]
    X_scaled = scaler.transform(np.array([e["cluster_features"] for e in db_entries], dtype=float))
    dists = np.linalg.norm(X_scaled - q_scaled, axis=1)
    nearest_idx = int(np.argmin(dists))
    archetype = db_entries[nearest_idx]["archetype"]

    return archetype, latest["stats"], latest["age"]
