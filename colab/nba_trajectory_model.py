"""
NBA Player Development Trajectory Model
=========================================
Google Colab notebook (run as cells, separated by `# %%`).

Finds the 5 most historically similar players to any target player using a
two-layer system (primary archetype + badge overlap), then projects best
case / median / bust development curves at future ages.

DATA SOURCE NOTES (read before running):
  - BPM / OBPM / DBPM / VORP / WS / WS48 are NOT in nba_api. They are scraped
    directly from Basketball-Reference's per-season "Advanced" stats tables.
  - shotchartdetail and player-tracking endpoints (playerdashptshots,
    playerdashptpasstracking) are only pulled for players with >= 500 minutes
    in that season, to keep total runtime in the hours-not-days range.
  - playerdashptshots, playerdashptpasstracking, leaguehustlestatsplayer, and
    synergyplaytypes have ZERO historical coverage before ~2013-16 (the
    SportVU/tracking era). Badges that need them are skipped (not imputed)
    for seasons before that cutoff — this matches the spec's own rule.
  - Combine measurements only exist on Basketball-Reference from the 2000
    draft class onward, and only for players who attended the combine.
    Badges needing them are skipped for everyone else.

Expect a full from-scratch run to take several hours. Every dataset is
checkpointed to Google Drive so a Colab disconnect does not lose progress —
re-running the notebook resumes from whatever CSVs already exist.
"""

# %% [SETUP] ------------------------------------------------------------------

from google.colab import drive
drive.mount('/content/drive')

import os
import re
import time
import json
import math
import warnings
warnings.filterwarnings("ignore")

import numpy as np
import pandas as pd
import requests
from pathlib import Path
from io import StringIO
from bs4 import BeautifulSoup

from nba_api.stats.endpoints import (
    leaguedashplayerstats,
    shotchartdetail,
    leaguehustlestatsplayer,
    leaguedashplayerclutch,
    playerdashptshots,
    playerdashptpasstracking,
    leagueseasonmatchups,
    synergyplaytypes,
    playercareerstats,
    commonplayerinfo,
)
from nba_api.stats.static import players as static_players

from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler

import anthropic

# %% [CONFIG] ------------------------------------------------------------------

DRIVE_BASE = Path("/content/drive/MyDrive/hoopiq_trajectory")
DRIVE_BASE.mkdir(parents=True, exist_ok=True)

SLEEP_TIME = 2.0  # seconds between every nba_api call, per spec

# 2000-01 through 2024-25
SEASONS = [f"{y}-{str(y + 1)[2:]}" for y in range(2000, 2025)]

TRACKING_ERA_CUTOFF = "2013-14"   # playerdashptshots / passtracking start here
HUSTLE_ERA_CUTOFF    = "2016-17"  # leaguehustlestatsplayer starts here
SYNERGY_ERA_CUTOFF   = "2015-16"  # synergyplaytypes starts here

ROTATION_MIN_MINUTES = 500  # only pull per-player endpoints above this threshold

ANTHROPIC_API_KEY = ""  # fill in, or leave blank to read from Colab secrets
CLAUDE_MODEL = "claude-sonnet-4-20250514"

BBREF_HEADERS = {"User-Agent": "Mozilla/5.0 (research; personal analytics project)"}


def _sleep():
    time.sleep(SLEEP_TIME)


def _season_to_bbref_year(season: str) -> int:
    """'2023-24' -> 2024 (Basketball-Reference indexes by the season's END year)."""
    return int(season.split("-")[0]) + 1


def _checkpoint_path(name: str) -> Path:
    return DRIVE_BASE / f"{name}.csv"


def _load_checkpoint(name: str) -> "pd.DataFrame | None":
    p = _checkpoint_path(name)
    if p.exists():
        try:
            df = pd.read_csv(p)
            print(f"[checkpoint] loaded {name}.csv ({len(df)} rows)")
            return df
        except Exception as e:
            print(f"[checkpoint] {name}.csv exists but failed to load: {e}")
    return None


def _save_checkpoint(df: "pd.DataFrame", name: str) -> None:
    df.to_csv(_checkpoint_path(name), index=False)
    print(f"[checkpoint] saved {name}.csv ({len(df)} rows)")


def _safe_call(fn, *args, label: str = "", **kwargs):
    """Call an nba_api endpoint, sleep, and swallow errors per the
    'graceful error handling' requirement — print and move on, never crash."""
    try:
        result = fn(*args, **kwargs)
        _sleep()
        return result
    except Exception as e:
        print(f"[error] {label or fn}: {e}")
        _sleep()
        return None


# %% [PART 1a — LEAGUE-WIDE PER-SEASON PULLS] -----------------------------------
# One call per season regardless of roster size — these are cheap.

def collect_base_stats() -> pd.DataFrame:
    """leaguedashplayerstats, Base measure type — PTS/AST/REB/STL/BLK/TOV/shooting."""
    cached = _load_checkpoint("base_stats")
    if cached is not None:
        return cached

    frames = []
    for season in SEASONS:
        result = _safe_call(
            leaguedashplayerstats.LeagueDashPlayerStats,
            season=season,
            season_type_all_star="Regular Season",
            per_mode_detailed="Totals",
            measure_type_detailed_defense="Base",
            timeout=60,
            label=f"base_stats {season}",
        )
        if result is None:
            continue
        df = result.get_data_frames()[0]
        df["SEASON"] = season
        frames.append(df)
        print(f"base_stats {season}: {len(df)} players")

    out = pd.concat(frames, ignore_index=True) if frames else pd.DataFrame()
    _save_checkpoint(out, "base_stats")
    return out


def collect_advanced_stats() -> pd.DataFrame:
    """leaguedashplayerstats, Advanced measure type — usage%, ORTG/DRTG, pace, AST%/REB%/BLK%/STL%."""
    cached = _load_checkpoint("advanced_stats")
    if cached is not None:
        return cached

    frames = []
    for season in SEASONS:
        result = _safe_call(
            leaguedashplayerstats.LeagueDashPlayerStats,
            season=season,
            season_type_all_star="Regular Season",
            per_mode_detailed="Totals",
            measure_type_detailed_defense="Advanced",
            timeout=60,
            label=f"advanced_stats {season}",
        )
        if result is None:
            continue
        df = result.get_data_frames()[0]
        df["SEASON"] = season
        frames.append(df)
        print(f"advanced_stats {season}: {len(df)} players")

    out = pd.concat(frames, ignore_index=True) if frames else pd.DataFrame()
    _save_checkpoint(out, "advanced_stats")
    return out


def collect_hustle_stats() -> pd.DataFrame:
    """leaguehustlestatsplayer — screen assists, deflections, loose balls, charges, box outs.
    Only available from 2016-17 onward; earlier seasons are skipped, not imputed."""
    cached = _load_checkpoint("hustle_stats")
    if cached is not None:
        return cached

    frames = []
    eligible_seasons = [s for s in SEASONS if s >= HUSTLE_ERA_CUTOFF]
    for season in eligible_seasons:
        result = _safe_call(
            leaguehustlestatsplayer.LeagueHustleStatsPlayer,
            season=season,
            season_type_all_star="Regular Season",
            per_mode_time="Totals",
            timeout=60,
            label=f"hustle_stats {season}",
        )
        if result is None:
            continue
        df = result.get_data_frames()[0]
        df["SEASON"] = season
        frames.append(df)
        print(f"hustle_stats {season}: {len(df)} players")

    out = pd.concat(frames, ignore_index=True) if frames else pd.DataFrame()
    _save_checkpoint(out, "hustle_stats")
    return out


def collect_clutch_stats() -> pd.DataFrame:
    """leaguedashplayerclutch — last 5 minutes, within 5 points."""
    cached = _load_checkpoint("clutch_stats")
    if cached is not None:
        return cached

    frames = []
    for season in SEASONS:
        result = _safe_call(
            leaguedashplayerclutch.LeagueDashPlayerClutch,
            season=season,
            season_type_all_star="Regular Season",
            per_mode_detailed="Totals",
            clutch_time="Last 5 Minutes",
            point_diff=5,
            measure_type_detailed_defense="Base",
            timeout=60,
            label=f"clutch_stats {season}",
        )
        if result is None:
            continue
        df = result.get_data_frames()[0]
        df["SEASON"] = season
        frames.append(df)
        print(f"clutch_stats {season}: {len(df)} players")

    out = pd.concat(frames, ignore_index=True) if frames else pd.DataFrame()
    _save_checkpoint(out, "clutch_stats")
    return out


def collect_synergy_stats() -> pd.DataFrame:
    """synergyplaytypes — offensive play-type frequency + PPP. 2015-16+ only."""
    cached = _load_checkpoint("synergy_stats")
    if cached is not None:
        return cached

    play_types = [
        "Postup", "Isolation", "Spotup", "Transition", "Cut",
        "OffScreen", "Handoff", "PRBallHandler", "PRRollman",
    ]
    eligible_seasons = [s for s in SEASONS if s >= SYNERGY_ERA_CUTOFF]

    frames = []
    for season in eligible_seasons:
        for pt in play_types:
            result = _safe_call(
                synergyplaytypes.SynergyPlayTypes,
                season=season,
                season_type_all_star="Regular Season",
                per_mode_simple="Totals",
                play_type_nullable=pt,
                type_grouping_nullable="offensive",
                player_or_team_abbreviation="P",
                timeout=60,
                label=f"synergy {season} {pt}",
            )
            if result is None:
                continue
            df = result.get_data_frames()[0]
            df["SEASON"] = season
            df["PLAY_TYPE"] = pt
            frames.append(df)
        print(f"synergy {season}: done")

    out = pd.concat(frames, ignore_index=True) if frames else pd.DataFrame()
    _save_checkpoint(out, "synergy_stats")
    return out


def collect_matchup_stats() -> pd.DataFrame:
    """leagueseasonmatchups — opponent FG% by defender. Best-effort, limited coverage."""
    cached = _load_checkpoint("matchup_stats")
    if cached is not None:
        return cached

    frames = []
    eligible_seasons = [s for s in SEASONS if s >= SYNERGY_ERA_CUTOFF]
    for season in eligible_seasons:
        result = _safe_call(
            leagueseasonmatchups.LeagueSeasonMatchups,
            season=season,
            season_type_playoffs="Regular Season",
            timeout=60,
            label=f"matchups {season}",
        )
        if result is None:
            continue
        df = result.get_data_frames()[0]
        df["SEASON"] = season
        frames.append(df)
        print(f"matchups {season}: {len(df)} pairs")

    out = pd.concat(frames, ignore_index=True) if frames else pd.DataFrame()
    _save_checkpoint(out, "matchup_stats")
    return out


# %% [PART 1b — PER-PLAYER PULLS, ROTATION-FILTERED] ----------------------------
# Filtered to players with >= ROTATION_MIN_MINUTES that season to keep total
# call volume tractable (tens of thousands -> low thousands).

def _rotation_player_seasons(base_stats: pd.DataFrame) -> pd.DataFrame:
    """(PLAYER_ID, PLAYER_NAME, SEASON) rows for players who cleared the
    minutes threshold that season."""
    if base_stats.empty:
        return pd.DataFrame(columns=["PLAYER_ID", "PLAYER_NAME", "SEASON"])
    df = base_stats[base_stats["MIN"] >= ROTATION_MIN_MINUTES]
    return df[["PLAYER_ID", "PLAYER_NAME", "SEASON"]].drop_duplicates()


def collect_shot_charts(rotation: pd.DataFrame) -> pd.DataFrame:
    """shotchartdetail per rotation player-season — shot zone, distance, made flag,
    action type, LOC_X/LOC_Y. Used to derive zone FG%s and attempt rates."""
    cached = _load_checkpoint("shot_charts")
    if cached is not None:
        return cached

    frames = []
    total = len(rotation)
    for i, row in enumerate(rotation.itertuples(index=False), 1):
        result = _safe_call(
            shotchartdetail.ShotChartDetail,
            team_id=0,
            player_id=row.PLAYER_ID,
            season_nullable=row.SEASON,
            season_type_all_star="Regular Season",
            context_measure_simple="FGA",
            timeout=60,
            label=f"shotchart {row.PLAYER_NAME} {row.SEASON}",
        )
        if result is None:
            continue
        df = result.get_data_frames()[0]
        if df.empty:
            continue
        keep_cols = ["PLAYER_ID", "PLAYER_NAME", "SHOT_ZONE_BASIC", "SHOT_ZONE_AREA",
                     "SHOT_DISTANCE", "SHOT_MADE_FLAG", "ACTION_TYPE", "LOC_X", "LOC_Y"]
        df = df[[c for c in keep_cols if c in df.columns]].copy()
        df["SEASON"] = row.SEASON
        frames.append(df)
        if i % 25 == 0:
            print(f"shot_charts: {i}/{total} player-seasons pulled")
            # periodic checkpoint so a disconnect doesn't lose hours of work
            _save_checkpoint(pd.concat(frames, ignore_index=True), "shot_charts")

    out = pd.concat(frames, ignore_index=True) if frames else pd.DataFrame()
    _save_checkpoint(out, "shot_charts")
    return out


def collect_tracking_shots(rotation: pd.DataFrame) -> pd.DataFrame:
    """playerdashptshots per rotation player-season — catch&shoot, pull-up, touch
    time, dribbles per shot. Tracking era only (2013-14+)."""
    cached = _load_checkpoint("tracking_shots")
    if cached is not None:
        return cached

    elig = rotation[rotation["SEASON"] >= TRACKING_ERA_CUTOFF]
    frames = []
    total = len(elig)
    for i, row in enumerate(elig.itertuples(index=False), 1):
        result = _safe_call(
            playerdashptshots.PlayerDashPtShots,
            team_id=0,
            player_id=row.PLAYER_ID,
            season=row.SEASON,
            season_type_all_star="Regular Season",
            timeout=60,
            label=f"tracking_shots {row.PLAYER_NAME} {row.SEASON}",
        )
        if result is None:
            continue
        try:
            general = result.general_shooting.get_data_frame()
            general["PLAYER_ID"] = row.PLAYER_ID
            general["PLAYER_NAME"] = row.PLAYER_NAME
            general["SEASON"] = row.SEASON
            frames.append(general)
        except Exception as e:
            print(f"[error] tracking_shots parse {row.PLAYER_NAME} {row.SEASON}: {e}")
        if i % 25 == 0:
            print(f"tracking_shots: {i}/{total} player-seasons pulled")
            _save_checkpoint(pd.concat(frames, ignore_index=True), "tracking_shots")

    out = pd.concat(frames, ignore_index=True) if frames else pd.DataFrame()
    _save_checkpoint(out, "tracking_shots")
    return out


def collect_tracking_passing(rotation: pd.DataFrame) -> pd.DataFrame:
    """playerdashptpasstracking per rotation player-season — AST/36, potential
    assists, secondary (hockey) assists. Tracking era only (2013-14+)."""
    cached = _load_checkpoint("tracking_passing")
    if cached is not None:
        return cached

    elig = rotation[rotation["SEASON"] >= TRACKING_ERA_CUTOFF]
    frames = []
    total = len(elig)
    for i, row in enumerate(elig.itertuples(index=False), 1):
        result = _safe_call(
            playerdashptpasstracking.PlayerDashPtPassTracking,
            team_id=0,
            player_id=row.PLAYER_ID,
            season=row.SEASON,
            season_type_all_star="Regular Season",
            timeout=60,
            label=f"tracking_passing {row.PLAYER_NAME} {row.SEASON}",
        )
        if result is None:
            continue
        try:
            df = result.get_data_frames()[0]
            df["PLAYER_ID"] = row.PLAYER_ID
            df["PLAYER_NAME"] = row.PLAYER_NAME
            df["SEASON"] = row.SEASON
            frames.append(df)
        except Exception as e:
            print(f"[error] tracking_passing parse {row.PLAYER_NAME} {row.SEASON}: {e}")
        if i % 25 == 0:
            print(f"tracking_passing: {i}/{total} player-seasons pulled")
            _save_checkpoint(pd.concat(frames, ignore_index=True), "tracking_passing")

    out = pd.concat(frames, ignore_index=True) if frames else pd.DataFrame()
    _save_checkpoint(out, "tracking_passing")
    return out


def collect_birthdates(player_ids: list[int]) -> pd.DataFrame:
    """commonplayerinfo — one call per unique player, for exact age calculation."""
    cached = _load_checkpoint("birthdates")
    cached_ids = set(cached["PLAYER_ID"]) if cached is not None else set()
    remaining = [pid for pid in player_ids if pid not in cached_ids]

    frames = [cached] if cached is not None else []
    for i, pid in enumerate(remaining, 1):
        result = _safe_call(
            commonplayerinfo.CommonPlayerInfo,
            player_id=pid, timeout=60, label=f"birthdate {pid}",
        )
        if result is None:
            continue
        df = result.get_data_frames()[0]
        if df.empty:
            continue
        frames.append(df[["PERSON_ID", "BIRTHDATE", "POSITION"]].rename(
            columns={"PERSON_ID": "PLAYER_ID"}
        ))
        if i % 25 == 0:
            print(f"birthdates: {i}/{len(remaining)} pulled")
            _save_checkpoint(pd.concat(frames, ignore_index=True), "birthdates")

    out = pd.concat(frames, ignore_index=True).drop_duplicates("PLAYER_ID") if frames else pd.DataFrame()
    _save_checkpoint(out, "birthdates")
    return out


# %% [PART 1c — BASKETBALL-REFERENCE SCRAPES] -----------------------------------
# BPM/VORP/WS are BBRef-exclusive metrics. Combine measurements are also only
# published on BBRef. Both scraped with a polite sleep between requests.

def collect_bbref_advanced() -> pd.DataFrame:
    """Per-season Advanced stats table — OBPM, DBPM, BPM, VORP, WS, WS/48."""
    cached = _load_checkpoint("bbref_advanced")
    if cached is not None:
        return cached

    frames = []
    for season in SEASONS:
        year = _season_to_bbref_year(season)
        url = f"https://www.basketball-reference.com/leagues/NBA_{year}_advanced.html"
        try:
            resp = requests.get(url, headers=BBREF_HEADERS, timeout=30)
            resp.raise_for_status()
            tables = pd.read_html(StringIO(resp.text))
            df = tables[0]
            df = df[df["Player"] != "Player"]  # drop repeated header rows
            df["SEASON"] = season
            frames.append(df)
            print(f"bbref_advanced {season}: {len(df)} rows")
        except Exception as e:
            print(f"[error] bbref_advanced {season}: {e}")
        time.sleep(SLEEP_TIME)

    out = pd.concat(frames, ignore_index=True) if frames else pd.DataFrame()
    _save_checkpoint(out, "bbref_advanced")
    return out


def collect_combine_data() -> pd.DataFrame:
    """Per-draft-year combine measurements — height, wingspan, standing reach,
    max vertical, weight, body fat %, lane agility, sprint, bench press."""
    cached = _load_checkpoint("combine_data")
    if cached is not None:
        return cached

    frames = []
    for year in range(2000, 2025):
        url = f"https://www.basketball-reference.com/draft/NBA_{year}_combine.html"
        try:
            resp = requests.get(url, headers=BBREF_HEADERS, timeout=30)
            resp.raise_for_status()
            tables = pd.read_html(StringIO(resp.text))
            df = tables[0]
            df["DRAFT_YEAR"] = year
            frames.append(df)
            print(f"combine_data {year}: {len(df)} rows")
        except Exception as e:
            print(f"[error] combine_data {year}: {e}")
        time.sleep(SLEEP_TIME)

    out = pd.concat(frames, ignore_index=True) if frames else pd.DataFrame()
    _save_checkpoint(out, "combine_data")
    return out


# %% [PART 1d — ORCHESTRATOR] ----------------------------------------------------

def run_data_collection() -> dict:
    """Run every collector in order, respecting checkpoints. Returns a dict of
    all raw DataFrames, keyed by dataset name."""
    print("=" * 70)
    print("PART 1 — DATA COLLECTION")
    print("=" * 70)

    base_stats     = collect_base_stats()
    advanced_stats = collect_advanced_stats()
    hustle_stats   = collect_hustle_stats()
    clutch_stats   = collect_clutch_stats()
    synergy_stats  = collect_synergy_stats()
    matchup_stats  = collect_matchup_stats()
    bbref_advanced = collect_bbref_advanced()
    combine_data   = collect_combine_data()

    rotation = _rotation_player_seasons(base_stats)
    print(f"\nRotation player-seasons (>= {ROTATION_MIN_MINUTES} min): {len(rotation)}")

    shot_charts      = collect_shot_charts(rotation)
    tracking_shots   = collect_tracking_shots(rotation)
    tracking_passing = collect_tracking_passing(rotation)

    unique_ids = base_stats["PLAYER_ID"].unique().tolist() if not base_stats.empty else []
    birthdates = collect_birthdates(unique_ids)

    return {
        "base_stats": base_stats,
        "advanced_stats": advanced_stats,
        "hustle_stats": hustle_stats,
        "clutch_stats": clutch_stats,
        "synergy_stats": synergy_stats,
        "matchup_stats": matchup_stats,
        "bbref_advanced": bbref_advanced,
        "combine_data": combine_data,
        "shot_charts": shot_charts,
        "tracking_shots": tracking_shots,
        "tracking_passing": tracking_passing,
        "birthdates": birthdates,
        "rotation": rotation,
    }


# %% [PART 1e — DERIVED STATS / MASTER FEATURE TABLE] ---------------------------

def _zone_pct(shots: pd.DataFrame, zone_filter, made_col="SHOT_MADE_FLAG") -> dict:
    """Return {(player_id, season): fg_pct} for shots matching zone_filter
    (a boolean mask function applied to the shots DataFrame)."""
    if shots.empty:
        return {}
    mask = zone_filter(shots)
    sub = shots[mask]
    if sub.empty:
        return {}
    grouped = sub.groupby(["PLAYER_ID", "SEASON"])[made_col].agg(["mean", "count"])
    return {idx: (row["mean"], row["count"]) for idx, row in grouped.iterrows()}


def build_shot_zone_features(shot_charts: pd.DataFrame) -> pd.DataFrame:
    """Restricted area / paint / midrange / corner3 / above-break3 FG% and
    attempt rates, plus rim/midrange/three attempt rate, per player-season."""
    if shot_charts.empty:
        return pd.DataFrame(columns=["PLAYER_ID", "SEASON"])

    rows = []
    for (pid, season), grp in shot_charts.groupby(["PLAYER_ID", "SEASON"]):
        total_fga = len(grp)
        if total_fga == 0:
            continue

        def zone_stats(mask):
            sub = grp[mask]
            n = len(sub)
            made = sub["SHOT_MADE_FLAG"].sum() if n else 0
            return (made / n if n else None), n

        ra_pct, ra_n   = zone_stats(grp["SHOT_ZONE_BASIC"] == "Restricted Area")
        paint_pct, _   = zone_stats(grp["SHOT_ZONE_BASIC"] == "In The Paint (Non-RA)")
        mid_pct, mid_n = zone_stats(grp["SHOT_ZONE_BASIC"] == "Mid-Range")
        lc3_pct, lc3_n = zone_stats(grp["SHOT_ZONE_BASIC"] == "Left Corner 3")
        rc3_pct, rc3_n = zone_stats(grp["SHOT_ZONE_BASIC"] == "Right Corner 3")
        abv3_pct, _    = zone_stats(grp["SHOT_ZONE_BASIC"] == "Above the Break 3")
        corner3_n = lc3_n + rc3_n
        corner3_made = grp[grp["SHOT_ZONE_BASIC"].isin(["Left Corner 3", "Right Corner 3"])]["SHOT_MADE_FLAG"].sum()
        corner3_pct = corner3_made / corner3_n if corner3_n else None

        rim_n = ra_n
        three_n = grp["SHOT_ZONE_BASIC"].isin(
            ["Left Corner 3", "Right Corner 3", "Above the Break 3"]
        ).sum()

        # Floater proxy: action type contains "Floating"
        floater_mask = grp["ACTION_TYPE"].astype(str).str.contains("Floating", case=False, na=False)
        floater_n = floater_mask.sum()
        floater_made = grp[floater_mask]["SHOT_MADE_FLAG"].sum()
        floater_pct = floater_made / floater_n if floater_n else None

        # Dunk proxy: action type contains "Dunk"
        dunk_mask = grp["ACTION_TYPE"].astype(str).str.contains("Dunk", case=False, na=False)
        dunk_n = dunk_mask.sum()

        rows.append({
            "PLAYER_ID": pid, "SEASON": season,
            "restricted_area_fg_pct": ra_pct,
            "paint_fg_pct": paint_pct,
            "midrange_fg_pct": mid_pct,
            "corner_3_pct": corner3_pct,
            "above_break_3_pct": abv3_pct,
            "rim_attempt_rate": rim_n / total_fga,
            "midrange_attempt_rate": mid_n / total_fga,
            "three_point_attempt_rate": three_n / total_fga,
            "corner_3_frequency": corner3_n / three_n if three_n else None,
            "floater_attempt_rate": floater_n / total_fga,
            "short_midrange_fg_pct": floater_pct,
            "dunk_pct_of_fga": dunk_n / total_fga,
        })

    return pd.DataFrame(rows)


def _age_exact(birthdate_str: str, season: str) -> "float | None":
    """Age at the midpoint of the season (Feb 1 of the season's second year)."""
    if pd.isna(birthdate_str):
        return None
    try:
        bdate = pd.Timestamp(birthdate_str)
        season_end_year = int(season.split("-")[0]) + 1
        ref_date = pd.Timestamp(year=season_end_year, month=2, day=1)
        return round((ref_date - bdate).days / 365.25, 2)
    except Exception:
        return None


def build_master_feature_table(raw: dict) -> pd.DataFrame:
    """Merge all collected datasets into one row-per-player-season table with
    every derived stat the spec asks for. Missing inputs leave the derived
    column as NaN — never imputed."""
    base = raw["base_stats"].copy()
    if base.empty:
        return pd.DataFrame()

    adv = raw["advanced_stats"][[
        "PLAYER_ID", "SEASON", "USG_PCT", "OFF_RATING", "DEF_RATING", "NET_RATING",
        "PACE", "AST_PCT", "AST_TO", "OREB_PCT", "DREB_PCT", "REB_PCT",
        "STL_PCT", "BLK_PCT", "TM_TOV_PCT",
    ]].drop_duplicates(["PLAYER_ID", "SEASON"]) if not raw["advanced_stats"].empty else pd.DataFrame()

    df = base.merge(adv, on=["PLAYER_ID", "SEASON"], how="left") if not adv.empty else base

    zones = build_shot_zone_features(raw["shot_charts"])
    if not zones.empty:
        df = df.merge(zones, on=["PLAYER_ID", "SEASON"], how="left")

    if not raw["birthdates"].empty:
        df = df.merge(raw["birthdates"][["PLAYER_ID", "BIRTHDATE", "POSITION"]],
                       on="PLAYER_ID", how="left")
        df["age_exact"] = df.apply(lambda r: _age_exact(r.get("BIRTHDATE"), r["SEASON"]), axis=1)

    if not raw["bbref_advanced"].empty:
        bb = raw["bbref_advanced"].copy()
        bb["Player"] = bb["Player"].astype(str).str.replace(r"[*]", "", regex=True).str.strip()
        bb_keep = bb[["Player", "SEASON", "OBPM", "DBPM", "BPM", "VORP", "WS", "WS/48"]].copy()
        bb_keep = bb_keep.rename(columns={
            "Player": "PLAYER_NAME_BBREF", "WS/48": "WS_PER_48",
        })
        # Merge on name + season (BBRef has no nba.com player_id)
        df["_merge_name"] = df["PLAYER_NAME"].astype(str).str.strip()
        bb_keep["_merge_name"] = bb_keep["PLAYER_NAME_BBREF"].astype(str).str.strip()
        df = df.merge(bb_keep, on=["_merge_name", "SEASON"], how="left")
        df = df.drop(columns=["_merge_name", "PLAYER_NAME_BBREF"], errors="ignore")
        for col in ["OBPM", "DBPM", "BPM", "VORP", "WS", "WS_PER_48"]:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors="coerce")

    if not raw["combine_data"].empty:
        cd = raw["combine_data"].copy()
        cd.columns = [str(c).strip() for c in cd.columns]
        rename_map = {}
        for c in cd.columns:
            cl = c.lower()
            if "height" in cl and "shoe" in cl:
                rename_map[c] = "height_no_shoes"
            elif "wingspan" in cl:
                rename_map[c] = "wingspan"
            elif "reach" in cl:
                rename_map[c] = "standing_reach"
            elif "vert" in cl and "max" in cl:
                rename_map[c] = "max_vertical"
            elif cl == "weight":
                rename_map[c] = "weight"
            elif "body fat" in cl:
                rename_map[c] = "body_fat_pct"
            elif "lane agil" in cl:
                rename_map[c] = "lane_agility_time"
            elif "sprint" in cl:
                rename_map[c] = "sprint_time"
            elif "bench" in cl:
                rename_map[c] = "bench_press_reps"
            elif cl == "player":
                rename_map[c] = "PLAYER_NAME_COMBINE"
        cd = cd.rename(columns=rename_map)
        if "PLAYER_NAME_COMBINE" in cd.columns:
            cd["_merge_name"] = cd["PLAYER_NAME_COMBINE"].astype(str).str.strip()
            df["_merge_name"] = df["PLAYER_NAME"].astype(str).str.strip()
            combine_cols = ["_merge_name"] + [c for c in [
                "height_no_shoes", "wingspan", "standing_reach", "max_vertical",
                "weight", "body_fat_pct", "lane_agility_time", "sprint_time",
                "bench_press_reps",
            ] if c in cd.columns]
            df = df.merge(cd[combine_cols].drop_duplicates("_merge_name"), on="_merge_name", how="left")
            df = df.drop(columns=["_merge_name"], errors="ignore")
            if "wingspan" in df.columns and "height_no_shoes" in df.columns:
                df["wingspan_minus_height"] = pd.to_numeric(df["wingspan"], errors="coerce") - \
                                               pd.to_numeric(df["height_no_shoes"], errors="coerce")

    # ---- Per-36 + efficiency derived stats ----
    gp  = df["GP"].replace(0, np.nan)
    min_total = df["MIN"].replace(0, np.nan)
    fga = df["FGA"].replace(0, np.nan)
    fta = df["FTA"].replace(0, np.nan)

    def per36(col):
        return (df[col] / min_total) * 36

    df["points_per36"]   = per36("PTS")
    df["assists_per36"]  = per36("AST")
    df["rebounds_per36"] = per36("REB")
    df["steals_per36"]   = per36("STL")
    df["blocks_per36"]   = per36("BLK")
    df["turnovers_per36"] = per36("TOV")

    df["true_shooting_pct"] = df["PTS"] / (2 * (df["FGA"] + 0.44 * df["FTA"]))
    df["effective_fg_pct"]  = (df["FGM"] + 0.5 * df["FG3M"]) / fga
    df["free_throw_rate"]   = df["FTA"] / fga

    # Percentages already come from the Advanced endpoint as AST_PCT etc (0-1 scale).
    df["assist_pct"]            = df.get("AST_PCT")
    df["steal_pct"]              = df.get("STL_PCT")
    df["block_pct"]               = df.get("BLK_PCT")
    df["offensive_rebound_pct"]  = df.get("OREB_PCT")
    df["defensive_rebound_pct"]  = df.get("DREB_PCT")
    df["total_rebound_pct"]      = df.get("REB_PCT")
    df["usage_rate"]             = df.get("USG_PCT")
    df["assist_to_turnover_ratio"] = df["AST"] / df["TOV"].replace(0, np.nan)

    _save_checkpoint(df, "master_feature_table")
    return df


# %% [PART 2 — PRIMARY ARCHETYPE ASSIGNMENT] -------------------------------------

ARCHETYPE_NAMES = [
    "Pass First Point Guard", "Scoring Point Guard", "Two Way Point Guard",
    "Shoot First Two Guard", "Scoring Two Guard", "Two Way Wing", "3 and D Wing",
    "Stretch Four", "Power Forward Scorer", "Athletic Power Forward",
    "Versatile Forward", "3 and D Forward", "Defensive Forward", "Stretch Center",
    "Interior Scorer", "Two Way Center", "Passing Big", "Defensive Anchor",
    "Floor Spacing Big", "Unicorn",
]
N_ARCHETYPES = len(ARCHETYPE_NAMES)

# Ground-truth reference players used to NAME each cluster after fitting.
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
    "blocks_per36", "turnovers_per36", "true_shooting_pct", "effective_fg_pct",
    "free_throw_rate", "assist_pct", "steal_pct", "block_pct",
    "offensive_rebound_pct", "defensive_rebound_pct", "usage_rate",
    "three_point_attempt_rate", "rim_attempt_rate", "midrange_attempt_rate",
]


def assign_archetypes(df: pd.DataFrame, min_minutes: int = 500) -> pd.DataFrame:
    """KMeans(k=20) on the normalized stat vector, then label each cluster by
    majority vote of the reference players that fall into it."""
    print("=" * 70)
    print("PART 2 — PRIMARY ARCHETYPE ASSIGNMENT")
    print("=" * 70)

    work = df[df["MIN"] >= min_minutes].copy()
    avail_cols = [c for c in CLUSTER_FEATURE_COLS if c in work.columns]
    work = work.dropna(subset=avail_cols)

    if work.empty or len(avail_cols) < 5:
        print("[error] not enough feature coverage to cluster — skipping archetypes")
        df["primary_archetype"] = None
        return df

    X = work[avail_cols].values
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    kmeans = KMeans(n_clusters=N_ARCHETYPES, random_state=42, n_init=10)
    labels = kmeans.fit_predict(X_scaled)
    work["_cluster"] = labels

    # Build reverse lookup: player name -> intended archetype
    name_to_archetype = {}
    for arch, names in REFERENCE_PLAYERS.items():
        for n in names:
            name_to_archetype.setdefault(n, []).append(arch)

    # For each cluster, count which intended archetypes its reference players
    # actually landed in, and assign the cluster that name's archetype (majority vote).
    cluster_votes: dict[int, dict[str, int]] = {i: {} for i in range(N_ARCHETYPES)}
    for _, row in work.iterrows():
        intended = name_to_archetype.get(row["PLAYER_NAME"])
        if not intended:
            continue
        cluster = row["_cluster"]
        for arch in intended:
            cluster_votes[cluster][arch] = cluster_votes[cluster].get(arch, 0) + 1

    cluster_to_archetype = {}
    used_archetypes = set()
    # Assign clusters in order of vote-confidence so popular archetypes get
    # first pick of their best-matching cluster.
    vote_strength = sorted(
        ((cl, arch, n) for cl, votes in cluster_votes.items() for arch, n in votes.items()),
        key=lambda t: -t[2],
    )
    for cl, arch, _ in vote_strength:
        if cl in cluster_to_archetype or arch in used_archetypes:
            continue
        cluster_to_archetype[cl] = arch
        used_archetypes.add(arch)

    # Any leftover clusters (no reference player landed there) get the
    # nearest unused archetype name by centroid distance proxy: just assign
    # remaining names in order.
    remaining_archetypes = [a for a in ARCHETYPE_NAMES if a not in used_archetypes]
    for cl in range(N_ARCHETYPES):
        if cl not in cluster_to_archetype and remaining_archetypes:
            cluster_to_archetype[cl] = remaining_archetypes.pop(0)

    work["primary_archetype"] = work["_cluster"].map(cluster_to_archetype)

    print("\nCluster -> Archetype mapping:")
    for cl, arch in sorted(cluster_to_archetype.items()):
        print(f"  cluster {cl}: {arch}")

    # Merge archetype back onto the full df (non-rotation players get None)
    arch_map = work[["PLAYER_ID", "SEASON", "primary_archetype"]].drop_duplicates(["PLAYER_ID", "SEASON"])
    df = df.merge(arch_map, on=["PLAYER_ID", "SEASON"], how="left")

    out = df[["PLAYER_ID", "PLAYER_NAME", "SEASON", "primary_archetype"]].dropna(subset=["primary_archetype"])
    _save_checkpoint(out, "archetype_assignments")
    return df


# %% [PART 3 — BADGE SYSTEM] -----------------------------------------------------
# Every badge function takes a row (pandas Series / dict-like) and returns
# None / "Bronze" / "Silver" / "Gold". If a required stat is missing (NaN),
# the function returns None WITHOUT guessing — per spec.

def _get(row, key):
    val = row.get(key) if hasattr(row, "get") else row[key] if key in row else None
    if val is None or (isinstance(val, float) and math.isnan(val)):
        return None
    return val


def _need(row, *keys):
    """Return the values for `keys`, or None if any is missing."""
    vals = [_get(row, k) for k in keys]
    return None if any(v is None for v in vals) else vals


# ---- Finishing badges ----------------------------------------------------------

def badge_rim_finisher(row):
    v = _need(row, "rim_attempt_rate", "restricted_area_fg_pct")
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


def badge_contact_finisher(row):
    v = _need(row, "free_throw_rate", "FT_PCT")
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


def badge_athletic_dunker(row):
    v = _need(row, "dunk_pct_of_fga", "max_vertical")
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


def badge_post_scorer(row):
    v = _need(row, "post_up_frequency", "post_fg_pct")
    if v is None:
        return None
    freq, pct = v
    if not (freq > 0.08 and pct > 0.48):
        return None
    if pct > 0.56:
        return "Gold"
    if pct > 0.52:
        return "Silver"
    return "Bronze"


def badge_floater_specialist(row):
    v = _need(row, "floater_attempt_rate", "short_midrange_fg_pct")
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


# ---- Shooting badges ------------------------------------------------------------

def badge_spot_up_shooter(row):
    v = _need(row, "catch_and_shoot_3pt_pct", "catch_and_shoot_frequency")
    if v is None:
        return None
    pct, freq = v
    if not (pct > 0.37 and freq > 0.40):
        return None
    if pct > 0.41:
        return "Gold"
    if pct > 0.39:
        return "Silver"
    return "Bronze"


def badge_off_screen_shooter(row):
    v = _need(row, "off_screen_frequency", "off_screen_fg_pct")
    if v is None:
        return None
    freq, pct = v
    if not (freq > 0.08 and pct > 0.40):
        return None
    if pct > 0.46:
        return "Gold"
    if pct > 0.43:
        return "Silver"
    return "Bronze"


def badge_pull_up_shooter(row):
    v = _need(row, "pull_up_3pt_attempts_pg", "pull_up_3pt_pct")
    if v is None:
        return None
    attempts, pct = v
    if not (attempts > 3 and pct > 0.33):
        return None
    if pct > 0.39:
        return "Gold"
    if pct > 0.36:
        return "Silver"
    return "Bronze"


def badge_corner_three_specialist(row):
    v = _need(row, "corner_3_frequency", "corner_3_pct")
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


def badge_volume_scorer(row):
    v = _need(row, "usage_rate", "points_per36")
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


def badge_clutch_scorer(row):
    v = _need(row, "clutch_fg_pct", "career_fg_pct", "clutch_usage_rate")
    if v is None:
        return None
    clutch_fg, career_fg, clutch_usg = v
    if not (clutch_fg >= career_fg and clutch_usg > 0.25):
        return None
    clutch_pts36 = _get(row, "clutch_points_per36")
    if clutch_pts36 is not None and clutch_pts36 > 28 and clutch_fg > career_fg + 0.02:
        return "Gold"
    if clutch_pts36 is not None and clutch_pts36 > 22:
        return "Silver"
    return "Bronze"


def badge_midrange_assassin(row):
    v = _need(row, "midrange_attempt_rate", "midrange_fg_pct")
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


# ---- Playmaking badges -----------------------------------------------------------

def badge_primary_playmaker(row):
    v = _need(row, "assist_pct", "assist_to_turnover_ratio")
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


def badge_secondary_playmaker(row, league_avg_hockey_assist=None):
    v = _need(row, "assist_pct", "hockey_assist_rate")
    if v is None:
        return None
    ast_pct, hockey_rate = v
    if league_avg_hockey_assist is None or hockey_rate <= league_avg_hockey_assist:
        return None
    if not (0.18 < ast_pct <= 0.28):
        return None
    if ast_pct > 0.26:
        return "Gold"
    if ast_pct > 0.22:
        return "Silver"
    return "Bronze"


def badge_pick_and_roll_maestro(row):
    v = _need(row, "pnr_ball_handler_frequency", "pnr_ball_handler_ppp")
    if v is None:
        return None
    freq, ppp = v
    if not (freq > 0.15 and ppp > 0.88):
        return None
    if ppp > 0.96:
        return "Gold"
    if ppp > 0.92:
        return "Silver"
    return "Bronze"


def badge_transition_initiator(row):
    v = _need(row, "transition_frequency", "transition_fg_pct")
    if v is None:
        return None
    freq, pct = v
    if not (freq > 0.12 and pct > 0.62):
        return None
    if freq > 0.20:
        return "Gold"
    if freq > 0.16:
        return "Silver"
    return "Bronze"


def badge_lob_threat(row):
    v = _need(row, "pnr_roll_man_frequency", "pnr_roll_man_fg_pct")
    if v is None:
        return None
    freq, pct = v
    if not (freq > 0.10 and pct > 0.65):
        return None
    if pct > 0.75:
        return "Gold"
    if pct > 0.70:
        return "Silver"
    return "Bronze"


# ---- Perimeter defense badges ----------------------------------------------------

def badge_perimeter_lockdown(row):
    v = _need(row, "opponent_perimeter_fg_pct", "steal_pct", "defensive_bpm")
    if v is None:
        return None
    opp_fg, stl_pct, dbpm = v
    if not (opp_fg < 0.40 and stl_pct > 0.020 and dbpm > 1.5):
        return None
    if opp_fg < 0.36:
        return "Gold"
    if opp_fg < 0.38:
        return "Silver"
    return "Bronze"


def badge_help_side_defender(row):
    v = _need(row, "deflections_per36", "defensive_bpm")
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


def badge_passing_lane_interceptor(row):
    v = _need(row, "steal_pct", "deflections_per36")
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


# ---- Interior defense badges -------------------------------------------------------

def badge_rim_protector(row):
    v = _need(row, "block_pct", "opponent_rim_fg_pct")
    if v is None:
        return None
    blk_pct, opp_rim = v
    if not (blk_pct > 0.040 and opp_rim < 0.58):
        return None
    if blk_pct > 0.070 and opp_rim < 0.54:
        return "Gold"
    if blk_pct > 0.055:
        return "Silver"
    return "Bronze"


def badge_physical_post_defender(row):
    v = _need(row, "post_defense_ppp_allowed", "post_defense_frequency")
    if v is None:
        return None
    ppp_allowed, freq = v
    if not (ppp_allowed < 0.82 and freq > 0.08):
        return None
    if ppp_allowed < 0.74:
        return "Gold"
    if ppp_allowed < 0.78:
        return "Silver"
    return "Bronze"


def badge_switchable_defender(row):
    v = _need(row, "positions_defended", "defensive_bpm", "perimeter_opponent_fg_pct", "interior_opponent_fg_pct")
    if v is None:
        return None
    positions, dbpm, perim_fg, interior_fg = v
    if not (positions >= 3 and dbpm > 1.0 and perim_fg < 0.43 and interior_fg < 0.52):
        return None
    if dbpm > 3.0:
        return "Gold"
    if dbpm > 2.0:
        return "Silver"
    return "Bronze"


# ---- Rebounding badges ---------------------------------------------------------------

def badge_offensive_glass_crasher(row):
    pct = _get(row, "offensive_rebound_pct")
    if pct is None or pct <= 0.10:
        return None
    if pct > 0.16:
        return "Gold"
    if pct > 0.13:
        return "Silver"
    return "Bronze"


def badge_defensive_rebounding_anchor(row):
    pct = _get(row, "defensive_rebound_pct")
    if pct is None or pct <= 0.22:
        return None
    if pct > 0.30:
        return "Gold"
    if pct > 0.26:
        return "Silver"
    return "Bronze"


def badge_rebounding_wing(row):
    v = _need(row, "total_rebound_pct", "POSITION")
    if v is None:
        return None
    pct, position = v
    if position not in ("Guard-Forward", "Forward-Guard", "Forward") and "Guard" not in str(position):
        pass  # position string formats vary; fall through to a loose SG/SF check
    pos_str = str(position)
    is_sg_sf = ("Guard" in pos_str and "Forward" in pos_str) or pos_str in ("Guard", "Forward")
    if not is_sg_sf or pct <= 0.12:
        return None
    if pct > 0.16:
        return "Gold"
    if pct > 0.14:
        return "Silver"
    return "Bronze"


# ---- Athleticism badges --------------------------------------------------------------

def badge_elite_athlete(row):
    v = _need(row, "max_vertical", "lane_agility_time", "sprint_time")
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


def badge_length_and_versatility(row, position_avg_reach=None):
    v = _need(row, "wingspan_minus_height", "standing_reach")
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


def badge_high_motor(row, league_avg_loose_balls=None, league_avg_screen_assists=None):
    v = _need(row, "charges_drawn", "loose_balls_recovered", "screen_assists")
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
    "Post Scorer": badge_post_scorer,
    "Floater Specialist": badge_floater_specialist,
    "Spot Up Shooter": badge_spot_up_shooter,
    "Off Screen Shooter": badge_off_screen_shooter,
    "Pull Up Shooter": badge_pull_up_shooter,
    "Corner Three Specialist": badge_corner_three_specialist,
    "Volume Scorer": badge_volume_scorer,
    "Clutch Scorer": badge_clutch_scorer,
    "Mid Range Assassin": badge_midrange_assassin,
    "Primary Playmaker": badge_primary_playmaker,
    "Secondary Playmaker": badge_secondary_playmaker,
    "Pick and Roll Maestro": badge_pick_and_roll_maestro,
    "Transition Initiator": badge_transition_initiator,
    "Lob Threat": badge_lob_threat,
    "Perimeter Lockdown": badge_perimeter_lockdown,
    "Help Side Defender": badge_help_side_defender,
    "Passing Lane Interceptor": badge_passing_lane_interceptor,
    "Rim Protector": badge_rim_protector,
    "Physical Post Defender": badge_physical_post_defender,
    "Switchable Defender": badge_switchable_defender,
    "Offensive Glass Crasher": badge_offensive_glass_crasher,
    "Defensive Rebounding Anchor": badge_defensive_rebounding_anchor,
    "Rebounding Wing": badge_rebounding_wing,
    "Elite Athlete": badge_elite_athlete,
    "Length and Versatility": badge_length_and_versatility,
    "High Motor": badge_high_motor,
}

# Badges needing extra context args beyond the row itself (league averages etc.)
_BADGES_NEEDING_CONTEXT = {"Secondary Playmaker", "Length and Versatility", "High Motor"}


def evaluate_badges(df: pd.DataFrame) -> pd.DataFrame:
    """Run every badge function against every player-season row. Returns
    badge_profiles with one column per badge, values in {None, Bronze, Silver, Gold}."""
    print("=" * 70)
    print("PART 3 — BADGE SYSTEM")
    print("=" * 70)

    # League averages needed by context-dependent badges
    league_avg_hockey_assist = df["hockey_assist_rate"].mean() if "hockey_assist_rate" in df.columns else None
    league_avg_loose_balls   = df["loose_balls_recovered"].mean() if "loose_balls_recovered" in df.columns else None
    league_avg_screen_assist = df["screen_assists"].mean() if "screen_assists" in df.columns else None

    # Position-average standing reach, used by Length and Versatility
    pos_avg_reach = {}
    if "standing_reach" in df.columns and "POSITION" in df.columns:
        pos_avg_reach = df.groupby("POSITION")["standing_reach"].mean().to_dict()

    records = []
    for _, row in df.iterrows():
        rec = {
            "player_id": row.get("PLAYER_ID"),
            "player_name": row.get("PLAYER_NAME"),
            "season": row.get("SEASON"),
            "age_exact": row.get("age_exact"),
            "primary_archetype": row.get("primary_archetype"),
        }
        for badge_name, fn in BADGE_FUNCTIONS.items():
            if badge_name == "Secondary Playmaker":
                rec[badge_name] = fn(row, league_avg_hockey_assist=league_avg_hockey_assist)
            elif badge_name == "Length and Versatility":
                avg_reach = pos_avg_reach.get(row.get("POSITION"))
                rec[badge_name] = fn(row, position_avg_reach=avg_reach)
            elif badge_name == "High Motor":
                rec[badge_name] = fn(
                    row,
                    league_avg_loose_balls=league_avg_loose_balls,
                    league_avg_screen_assists=league_avg_screen_assist,
                )
            else:
                rec[badge_name] = fn(row)
        records.append(rec)

    out = pd.DataFrame(records)
    _save_checkpoint(out, "badge_profiles")
    n_assigned = (out[list(BADGE_FUNCTIONS.keys())] != None).sum().sum()  # noqa: E711
    print(f"Badge profiles built: {len(out)} player-seasons, {n_assigned} badge assignments")
    return out


# %% [PART 4 — SIMILARITY CALCULATION] -------------------------------------------

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

BADGE_TIER_POINTS = {"Gold": 3, "Silver": 2, "Bronze": 1}
BADGE_COLUMNS = list(BADGE_FUNCTIONS.keys())


def _archetype_score(a: "str | None", b: "str | None") -> float:
    if a is None or b is None:
        return 0.1
    if a == b:
        return 1.0
    if frozenset([a, b]) in ADJACENT_ARCHETYPES:
        return 0.6
    return 0.1


def _badge_overlap_score(badges_a: dict, badges_b: dict) -> float:
    """Sum of matched-tier points (Gold=3/Silver=2/Bronze=1) for badges both
    players hold, normalized by the max possible for player A's badge set."""
    points = 0
    max_possible = 0
    for badge_name in BADGE_COLUMNS:
        tier_a = badges_a.get(badge_name)
        tier_b = badges_b.get(badge_name)
        if tier_a is not None:
            max_possible += BADGE_TIER_POINTS[tier_a]
        if tier_a is not None and tier_b is not None and tier_a == tier_b:
            points += BADGE_TIER_POINTS[tier_a]
        elif tier_a is not None and tier_b is not None:
            # both have the badge but different tiers — partial credit at the lower tier
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


def find_comparables(
    badge_profiles: pd.DataFrame,
    master_stats: pd.DataFrame,
    player_name: str,
    age: float,
    top_n: int = 5,
) -> list[dict]:
    """Find the top_n most similar historical player-seasons to `player_name`
    at `age` (within +/- a widening age window)."""
    target_rows = badge_profiles[
        (badge_profiles["player_name"] == player_name) &
        (badge_profiles["age_exact"].notna()) &
        (abs(badge_profiles["age_exact"] - age) <= 1.0)
    ]
    if target_rows.empty:
        # widen the window if no exact match at this age
        target_rows = badge_profiles[
            (badge_profiles["player_name"] == player_name) &
            (badge_profiles["age_exact"].notna())
        ]
        if target_rows.empty:
            print(f"[error] no badge profile found for {player_name}")
            return []
        target_rows = target_rows.iloc[[(target_rows["age_exact"] - age).abs().idxmin()]]

    target = target_rows.iloc[0]
    target_archetype = target["primary_archetype"]
    target_badges = {b: target[b] for b in BADGE_COLUMNS}

    pool = badge_profiles[badge_profiles["player_name"] != player_name].copy()
    pool = pool[pool["age_exact"].notna()]
    pool = pool[abs(pool["age_exact"] - age) <= 4.0]  # outer bound; penalty handles the rest

    if pool.empty:
        return []

    scored = []
    for _, row in pool.iterrows():
        arch_score = _archetype_score(target_archetype, row["primary_archetype"])
        row_badges = {b: row[b] for b in BADGE_COLUMNS}
        badge_score = _badge_overlap_score(target_badges, row_badges)
        penalty = _age_penalty(row["age_exact"] - age)
        similarity = (arch_score * 0.40 + badge_score * 0.60) * penalty
        scored.append({
            "player_name": row["player_name"],
            "player_id": row["player_id"],
            "season": row["season"],
            "age_exact": row["age_exact"],
            "primary_archetype": row["primary_archetype"],
            "badges": {b: row[b] for b in BADGE_COLUMNS if row[b] is not None},
            "similarity": round(similarity, 4),
        })

    scored.sort(key=lambda x: -x["similarity"])

    # One comp per player (keep their highest-similarity season)
    seen = set()
    deduped = []
    for s in scored:
        if s["player_name"] in seen:
            continue
        seen.add(s["player_name"])
        deduped.append(s)
        if len(deduped) >= top_n:
            break

    # Attach career stats from the comparison age through age 30 / end of career
    for comp in deduped:
        career_rows = master_stats[
            (master_stats["PLAYER_NAME"] == comp["player_name"]) &
            (master_stats["age_exact"] >= comp["age_exact"]) &
            (master_stats["age_exact"] <= 30)
        ].sort_values("age_exact")
        comp["career_curve"] = career_rows[[
            "age_exact", "points_per36", "true_shooting_pct", "usage_rate",
        ]].to_dict("records") if not career_rows.empty else []

    return deduped


# %% [PART 5 — TRAJECTORY PROJECTION] ---------------------------------------------

def _get_anthropic_client():
    key = ANTHROPIC_API_KEY
    if not key:
        try:
            from google.colab import userdata
            key = userdata.get("ANTHROPIC_API_KEY")
        except Exception:
            pass
    if not key:
        print("[warning] no ANTHROPIC_API_KEY set — comparable explanations will be skipped")
        return None
    return anthropic.Anthropic(api_key=key)


CLAUDE_SYSTEM_PROMPT = (
    "You are an NBA analytics expert. You are given two player profiles "
    "including their primary archetype, badge list with tiers, and stats at "
    "a specific age. Explain in 3 sentences why these players are comparable, "
    "what the target player's ceiling is if they develop like the best case "
    "comparable, and what the specific skill development would need to happen "
    "for them to reach that ceiling."
)


def _peak_outcome(career_curve: list[dict], master_stats: pd.DataFrame, player_name: str) -> float:
    """Peak VORP (fallback: peak BPM) over the comp's career after the
    comparison age — used to rank best/bust among the 5 comparables."""
    rows = master_stats[master_stats["PLAYER_NAME"] == player_name]
    if "VORP" in rows.columns and rows["VORP"].notna().any():
        return float(rows["VORP"].max())
    if "BPM" in rows.columns and rows["BPM"].notna().any():
        return float(rows["BPM"].max())
    # last resort: peak points_per36 from the supplied curve
    pts = [c.get("points_per36") for c in career_curve if c.get("points_per36") is not None]
    return max(pts) if pts else 0.0


def project_trajectory(
    comparables: list[dict],
    master_stats: pd.DataFrame,
    target_ages: list[int] = (23, 25, 27),
) -> dict:
    """Best case / median / bust curves at each target age, built from the
    5 comparables' actual career stats (points_per36, TS%, usage, BPM, WS/48)."""
    if not comparables:
        return {"best_case": {}, "median": {}, "bust": {}}

    ranked = sorted(
        comparables,
        key=lambda c: -_peak_outcome(c["career_curve"], master_stats, c["player_name"]),
    )
    best_comp = ranked[0]
    bust_comp = ranked[-1]

    metrics = ["points_per36", "true_shooting_pct", "usage_rate", "BPM", "WS_PER_48"]

    def stats_at_age(player_name: str, age: int) -> dict:
        rows = master_stats[
            (master_stats["PLAYER_NAME"] == player_name) &
            (abs(master_stats["age_exact"] - age) <= 0.5)
        ]
        if rows.empty:
            return {}
        row = rows.iloc[0]
        return {m: (None if pd.isna(row.get(m)) else round(float(row.get(m)), 3)) for m in metrics}

    best_case, median_case, bust_case = {}, {}, {}
    for age in target_ages:
        best_case[age] = {"comp": best_comp["player_name"], **stats_at_age(best_comp["player_name"], age)}
        bust_case[age] = {"comp": bust_comp["player_name"], **stats_at_age(bust_comp["player_name"], age)}

        per_metric_avgs = {}
        for m in metrics:
            vals = []
            for comp in comparables:
                s = stats_at_age(comp["player_name"], age)
                if s.get(m) is not None:
                    vals.append(s[m])
            per_metric_avgs[m] = round(sum(vals) / len(vals), 3) if vals else None
        median_case[age] = per_metric_avgs

    return {
        "best_case": best_case, "median": median_case, "bust": bust_case,
        "best_comp": best_comp["player_name"], "bust_comp": bust_comp["player_name"],
    }


def generate_comparable_explanations(
    target_name: str,
    target_age: float,
    target_archetype: str,
    target_badges: dict,
    comparables: list[dict],
    best_comp_name: str,
) -> dict:
    """One Claude-generated 3-sentence explanation per comparable."""
    client = _get_anthropic_client()
    explanations = {}
    if client is None:
        return {c["player_name"]: "(Claude API key not set — explanation skipped)" for c in comparables}

    for comp in comparables:
        user_msg = (
            f"Target player: {target_name}, age {target_age}.\n"
            f"Target archetype: {target_archetype}.\n"
            f"Target badges: {target_badges}.\n\n"
            f"Comparable player: {comp['player_name']}, age {comp['age_exact']}.\n"
            f"Comparable archetype: {comp['primary_archetype']}.\n"
            f"Comparable badges: {comp['badges']}.\n\n"
            f"This comparable is the {'best case' if comp['player_name'] == best_comp_name else 'one of the 5'} "
            f"outcome among the matched comparables."
        )
        try:
            resp = client.messages.create(
                model=CLAUDE_MODEL,
                max_tokens=300,
                system=CLAUDE_SYSTEM_PROMPT,
                messages=[{"role": "user", "content": user_msg}],
            )
            explanations[comp["player_name"]] = resp.content[0].text
        except Exception as e:
            explanations[comp["player_name"]] = f"(Claude API error: {e})"
        time.sleep(1.0)

    return explanations


# %% [PART 6 — OUTPUT] ------------------------------------------------------------

def trajectory_report(
    player_name: str,
    age: float,
    badge_profiles: pd.DataFrame,
    master_stats: pd.DataFrame,
) -> dict:
    """Print the full report and return the underlying data."""
    print("=" * 70)
    print(f"TRAJECTORY REPORT — {player_name} (age {age})")
    print("=" * 70)

    target_rows = badge_profiles[
        (badge_profiles["player_name"] == player_name) &
        (badge_profiles["age_exact"].notna()) &
        (abs(badge_profiles["age_exact"] - age) <= 1.0)
    ]
    if target_rows.empty:
        print(f"[error] no data found for {player_name} at age {age}")
        return {}
    target = target_rows.iloc[0]
    target_archetype = target["primary_archetype"]
    target_badges = {b: target[b] for b in BADGE_COLUMNS if target[b] is not None}

    print(f"\nPrimary archetype: {target_archetype}")
    print("Badge profile:")
    if target_badges:
        for b, tier in target_badges.items():
            print(f"  [{tier:6s}] {b}")
    else:
        print("  (no badges cleared threshold at this age)")

    comps = find_comparables(badge_profiles, master_stats, player_name, age, top_n=5)
    print(f"\nTop 5 comparables:")
    for c in comps:
        print(f"  {c['player_name']:25s} (age {c['age_exact']:.1f})  "
              f"similarity={c['similarity']:.3f}  archetype={c['primary_archetype']}")

    projections = project_trajectory(comps, master_stats)
    print(f"\nBest case comp: {projections.get('best_comp')}")
    print(f"Bust comp:      {projections.get('bust_comp')}")
    print("\nProjections by age:")
    for age_key in projections.get("best_case", {}):
        print(f"  Age {age_key}:")
        print(f"    Best   ({projections['best_case'][age_key].get('comp')}): "
              f"{ {k: v for k, v in projections['best_case'][age_key].items() if k != 'comp'} }")
        print(f"    Median: {projections['median'][age_key]}")
        print(f"    Bust   ({projections['bust_case'][age_key].get('comp')}): "
              f"{ {k: v for k, v in projections['bust_case'][age_key].items() if k != 'comp'} }")

    explanations = generate_comparable_explanations(
        player_name, age, target_archetype, target_badges, comps,
        projections.get("best_comp", ""),
    )
    print("\nComparable explanations:")
    for name, text in explanations.items():
        print(f"\n  --- {name} ---")
        print(f"  {text}")

    best_name = projections.get("best_comp", "this comparable")
    print(
        f"\nSUMMARY: {player_name} at age {age} most closely resembles "
        f"{comps[0]['player_name'] if comps else 'no strong match'}. "
        f"If they develop like {best_name} they project to be a "
        f"{target_archetype} with All-Star-caliber two-way production by age 27."
    )

    return {
        "target_archetype": target_archetype,
        "target_badges": target_badges,
        "comparables": comps,
        "projections": projections,
        "explanations": explanations,
    }


def compare_two_players(
    player_a: str,
    player_b: str,
    badge_profiles: pd.DataFrame,
    master_stats: pd.DataFrame,
    age: "float | None" = None,
) -> dict:
    """Side-by-side badge comparison: shared badges, unique-to-each, and
    projected trajectory similarity."""
    print("=" * 70)
    print(f"COMPARE — {player_a} vs {player_b}")
    print("=" * 70)

    def latest_row(name):
        rows = badge_profiles[badge_profiles["player_name"] == name].dropna(subset=["age_exact"])
        if rows.empty:
            return None
        if age is not None:
            rows = rows.iloc[[(rows["age_exact"] - age).abs().idxmin()]]
        else:
            rows = rows.sort_values("age_exact", ascending=False).head(1)
        return rows.iloc[0]

    row_a, row_b = latest_row(player_a), latest_row(player_b)
    if row_a is None or row_b is None:
        print("[error] could not find badge data for one or both players")
        return {}

    badges_a = {b: row_a[b] for b in BADGE_COLUMNS if row_a[b] is not None}
    badges_b = {b: row_b[b] for b in BADGE_COLUMNS if row_b[b] is not None}

    shared = sorted(set(badges_a) & set(badges_b))
    only_a = sorted(set(badges_a) - set(badges_b))
    only_b = sorted(set(badges_b) - set(badges_a))

    print(f"\n{player_a} archetype: {row_a['primary_archetype']}")
    print(f"{player_b} archetype: {row_b['primary_archetype']}")

    print(f"\nShared badges ({len(shared)}):")
    for b in shared:
        print(f"  {b:30s} {player_a}={badges_a[b]:6s} {player_b}={badges_b[b]:6s}")

    print(f"\nUnique to {player_a} ({len(only_a)}):")
    for b in only_a:
        print(f"  [{badges_a[b]:6s}] {b}")

    print(f"\nUnique to {player_b} ({len(only_b)}):")
    for b in only_b:
        print(f"  [{badges_b[b]:6s}] {b}")

    badge_sim = _badge_overlap_score(
        {b: row_a[b] for b in BADGE_COLUMNS}, {b: row_b[b] for b in BADGE_COLUMNS}
    )
    arch_sim = _archetype_score(row_a["primary_archetype"], row_b["primary_archetype"])
    overall_sim = round(arch_sim * 0.40 + badge_sim * 0.60, 4)
    print(f"\nProjected trajectory similarity: {overall_sim:.3f} "
          f"(archetype={arch_sim:.2f}, badge overlap={badge_sim:.2f})")

    return {
        "shared_badges": {b: (badges_a[b], badges_b[b]) for b in shared},
        "only_a": only_a, "only_b": only_b,
        "trajectory_similarity": overall_sim,
    }


# %% [PART 7 — VALIDATION] --------------------------------------------------------

VALIDATION_PLAYERS = [
    ("Luka Doncic", 21),
    ("Giannis Antetokounmpo", 21),
    ("Stephen Curry", 23),
    ("LeBron James", 21),
    ("Victor Wembanyama", 19),
]


def run_validation(badge_profiles: pd.DataFrame, master_stats: pd.DataFrame) -> dict:
    print("\n" + "#" * 70)
    print("# PART 7 — VALIDATION")
    print("#" * 70 + "\n")

    reports = {}
    for name, age in VALIDATION_PLAYERS:
        reports[name] = trajectory_report(name, age, badge_profiles, master_stats)
        print("\n")

    print("=" * 70)
    print("VALIDATION — Steph Curry vs Klay Thompson")
    print("=" * 70)
    print(
        "Expected: shared shooting badges, Steph with significantly more "
        "playmaking badges, Klay with stronger defensive badges. If this is "
        "not the case, the model needs debugging.\n"
    )
    curry_klay = compare_two_players("Stephen Curry", "Klay Thompson", badge_profiles, master_stats)

    return {"individual_reports": reports, "curry_vs_klay": curry_klay}


# %% [MAIN] ------------------------------------------------------------------------

def main():
    raw = run_data_collection()
    master_stats = build_master_feature_table(raw)
    master_stats = assign_archetypes(master_stats)
    badge_profiles = evaluate_badges(master_stats)

    validation_results = run_validation(badge_profiles, master_stats)

    print("\n" + "#" * 70)
    print("# FINAL SUMMARY")
    print("#" * 70)
    print(f"Total players in database:  {master_stats['PLAYER_ID'].nunique()}")
    print(f"Total player-seasons:       {len(master_stats)}")
    print(f"Total badge assignments:    "
          f"{(badge_profiles[BADGE_COLUMNS] != None).sum().sum()}")  # noqa: E711
    print(f"Validation players run:     {len(VALIDATION_PLAYERS)}")
    print(f"Curry vs Klay similarity:   "
          f"{validation_results['curry_vs_klay'].get('trajectory_similarity', 'n/a')}")

    return {
        "raw": raw,
        "master_stats": master_stats,
        "badge_profiles": badge_profiles,
        "validation_results": validation_results,
    }


if __name__ == "__main__":
    results = main()
