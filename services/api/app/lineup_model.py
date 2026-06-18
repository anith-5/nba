"""
Hypothetical Lineup Predictor - XGBoost trained on real 5-man lineup data.

Pipeline:
  1. Fetch all league 5-man lineups + individual player season stats (NBA API)
  2. Cluster players into archetypes via KMeans (scoring, playmaking, 3&D, etc.)
  3. For each known lineup, build a feature vector from player stat averages,
     archetype distribution, spacing metrics, pairwise chemistry proxies
  4. Train XGBoost to predict net rating per 100 possessions
  5. Predict any custom 5-man lineup (including hypothetical ones never played)
"""

from __future__ import annotations

import time
import threading
from dataclasses import dataclass, field
from typing import Optional

import numpy as np
import pandas as pd

from app.config import settings

SEASON = settings.current_season
MIN_LINEUP_MIN = 8.0      # minimum minutes for a lineup to be included in training
N_ARCHETYPES = 6
RATE_LIMIT = 0.7

ARCHETYPE_NAMES = {
    0: "Primary Scorer",
    1: "Playmaker",
    2: "3-and-D Wing",
    3: "Interior Big",
    4: "Two-Way Wing",
    5: "Role Player",
}


def _sleep():
    time.sleep(RATE_LIMIT)


# ---------------------------------------------------------------------------
# Player feature extraction
# ---------------------------------------------------------------------------

PLAYER_FEATURE_COLS = [
    "PTS", "REB", "AST", "STL", "BLK", "TOV",
    "FG_PCT", "FG3_PCT", "FT_PCT", "FG3A", "MIN",
]


def _player_vec(stats: dict) -> np.ndarray:
    return np.array([float(stats.get(c, 0) or 0) for c in PLAYER_FEATURE_COLS])


# ---------------------------------------------------------------------------
# Lineup feature engineering
# ---------------------------------------------------------------------------

def _lineup_features(
    player_ids: list[int],
    player_stats: dict[int, dict],
    player_archetypes: dict[int, int],
) -> np.ndarray:
    """
    Build a 38-dim feature vector for a 5-man lineup:
      - 11 averaged player stats
      - 5 std deviations (scoring spread, etc.)
      - 3 totals (AST, 3PA, BLK)
      - 1 max PTS (star power)
      - 6 archetype counts (spacing, playmaking balance, etc.)
      - 5 pairwise chemistry proxies (based on archetype compatibility)
      - 7 derived metrics (spacing_idx, scoring_concentration, etc.)
    """
    vecs = []
    archs = []
    for pid in player_ids:
        if pid in player_stats:
            vecs.append(_player_vec(player_stats[pid]))
            archs.append(player_archetypes.get(pid, 5))
        else:
            vecs.append(np.zeros(len(PLAYER_FEATURE_COLS)))
            archs.append(5)

    arr = np.array(vecs)  # (5, 11)
    avg = arr.mean(axis=0)
    std = arr.std(axis=0)

    max_pts   = arr[:, 0].max()
    total_ast = arr[:, 2].sum()
    total_3pa = arr[:, 9].sum()
    total_blk = arr[:, 4].sum()

    # Archetype distribution (6 buckets)
    arch_counts = np.zeros(N_ARCHETYPES)
    for a in archs:
        arch_counts[min(a, N_ARCHETYPES - 1)] += 1

    # Pairwise chemistry: encode archetype pair compatibility
    # Pairs that work well: Scorer+Playmaker, 3&D+Playmaker, Big+Playmaker
    # Pairs that clash: Scorer+Scorer, Playmaker+Playmaker
    COMPAT = {
        (0, 1): 1.0,   # Scorer + Playmaker = great
        (1, 2): 0.9,   # Playmaker + 3andD = great
        (1, 3): 0.8,   # Playmaker + Big = good
        (0, 2): 0.7,   # Scorer + 3andD = good
        (3, 2): 0.7,   # Big + 3andD = good spacing
        (0, 0): -0.5,  # Scorer + Scorer = bad (ball hog)
        (1, 1): -0.4,  # Playmaker + Playmaker = bad
        (3, 3): -0.3,  # Big + Big = bad spacing
    }
    compat_score = 0.0
    pair_count   = 0
    for i in range(len(archs)):
        for j in range(i + 1, len(archs)):
            key = tuple(sorted([archs[i], archs[j]]))
            compat_score += COMPAT.get(key, 0.3)
            pair_count += 1
    avg_compat = compat_score / max(pair_count, 1)

    # Derived metrics
    scoring_concentration = std[0] / max(avg[0], 1)   # low = balanced offense
    spacing_idx = total_3pa / 5                         # 3PA per player
    playmaking_depth = total_ast / 5                    # assists per player
    paint_presence = total_blk / 5
    defensive_versatility = avg[3] + avg[4]            # STL + BLK avg
    ts_avg = avg[6] + 0.5 * avg[7]                     # rough TS proxy
    floor_spacing = np.sum(arr[:, 7] > 0.33)           # players shooting >33% from 3

    derived = np.array([
        scoring_concentration,
        spacing_idx,
        playmaking_depth,
        paint_presence,
        defensive_versatility,
        ts_avg,
        float(floor_spacing),
    ])

    return np.concatenate([avg, std[:5], [max_pts, total_ast, total_3pa], arch_counts, [avg_compat], derived])


# ---------------------------------------------------------------------------
# Model class
# ---------------------------------------------------------------------------

@dataclass
class LineupPredictorModel:
    player_stats:      dict[int, dict] = field(default_factory=dict)
    player_archetypes: dict[int, int]  = field(default_factory=dict)
    player_names:      dict[int, str]  = field(default_factory=dict)
    _xgb  = None
    _kmeans = None
    is_trained: bool = False
    training_samples: int = 0
    cv_rmse: float = 0.0


_model = LineupPredictorModel()
_train_lock = threading.Lock()
_is_training = False
_train_error: Optional[str] = None


def is_trained() -> bool:
    return _model.is_trained


def get_status() -> dict:
    return {
        "is_trained": _model.is_trained,
        "is_training": _is_training,
        "training_samples": _model.training_samples,
        "cv_rmse": _model.cv_rmse,
        "error": _train_error,
        "season": SEASON,
    }


# ---------------------------------------------------------------------------
# Training
# ---------------------------------------------------------------------------

def train() -> dict:
    global _model, _is_training, _train_error

    if not _train_lock.acquire(blocking=False):
        raise RuntimeError("Already training")

    try:
        from xgboost import XGBRegressor
        from sklearn.cluster import KMeans
        from sklearn.model_selection import cross_val_score
        from nba_api.stats.endpoints import leaguedashlineups, leaguedashplayerstats

        _is_training = True
        _train_error = None

        # --- Step 1: fetch player season stats ---
        _sleep()
        pstats_df = leaguedashplayerstats.LeagueDashPlayerStats(
            season=SEASON,
            per_mode_detailed="PerGame",
            timeout=120,
        ).get_data_frames()[0]

        player_stats: dict[int, dict] = {}
        player_names: dict[int, str] = {}
        for _, r in pstats_df.iterrows():
            pid = int(r["PLAYER_ID"])
            player_stats[pid] = r.to_dict()
            player_names[pid] = str(r["PLAYER_NAME"])

        # --- Step 2: cluster players into archetypes ---
        feature_matrix = []
        player_id_order = []
        for pid, s in player_stats.items():
            if float(s.get("MIN", 0)) >= 10:
                feature_matrix.append(_player_vec(s))
                player_id_order.append(pid)

        X_cluster = np.array(feature_matrix)
        from sklearn.preprocessing import StandardScaler
        scaler = StandardScaler()
        X_scaled = scaler.fit_transform(X_cluster)

        kmeans = KMeans(n_clusters=N_ARCHETYPES, random_state=42, n_init=10)
        labels = kmeans.fit_predict(X_scaled)

        player_archetypes: dict[int, int] = {}
        for pid, lbl in zip(player_id_order, labels):
            player_archetypes[pid] = int(lbl)

        # Relabel archetypes by avg PTS (descending) so label 0 = Primary Scorer
        cluster_pts = {}
        for pid, lbl in player_archetypes.items():
            s = player_stats[pid]
            cluster_pts.setdefault(lbl, []).append(float(s.get("PTS", 0)))
        cluster_avg_pts = {k: np.mean(v) for k, v in cluster_pts.items()}
        rank_map = {
            lbl: rank for rank, (lbl, _) in enumerate(
                sorted(cluster_avg_pts.items(), key=lambda x: -x[1])
            )
        }
        player_archetypes = {pid: rank_map[lbl] for pid, lbl in player_archetypes.items()}

        # --- Step 3: fetch all 5-man lineups (league-wide) ---
        _sleep()
        lu_df = leaguedashlineups.LeagueDashLineups(
            measure_type_detailed_defense="Advanced",
            per_mode_detailed="Per100Possessions",
            season=SEASON,
            season_type_all_star="Regular Season",
            group_quantity=5,
            timeout=180,
        ).get_data_frames()[0]

        lu_df = lu_df[lu_df["MIN"] >= MIN_LINEUP_MIN].copy()

        # --- Step 4: build training set ---
        X_rows, y_rows = [], []

        for _, row in lu_df.iterrows():
            group = str(row.get("GROUP_NAME", ""))
            group_id = str(row.get("GROUP_ID", ""))

            # Parse player IDs from GROUP_ID (comma-separated IDs)
            player_ids = []
            for part in group_id.split(" - "):
                part = part.strip()
                try:
                    pid = int(part)
                    if pid in player_stats:
                        player_ids.append(pid)
                except ValueError:
                    pass

            # Fallback: match by name
            if len(player_ids) < 3:
                names = [n.strip() for n in group.split(" - ")]
                name_to_id = {v: k for k, v in player_names.items()}
                player_ids = [name_to_id[n] for n in names if n in name_to_id]

            if len(player_ids) != 5:
                continue

            net_rtg = float(row.get("NET_RATING", 0))
            if abs(net_rtg) > 50:  # filter garbage outliers
                continue

            feat = _lineup_features(player_ids, player_stats, player_archetypes)
            X_rows.append(feat)
            y_rows.append(net_rtg)

        if len(X_rows) < 20:
            raise RuntimeError(f"Not enough lineup training data: only {len(X_rows)} samples. Season may lack data.")

        X = np.array(X_rows)
        y = np.array(y_rows)

        # --- Step 5: train XGBoost ---
        xgb = XGBRegressor(
            n_estimators=300,
            max_depth=4,
            learning_rate=0.04,
            subsample=0.8,
            colsample_bytree=0.8,
            min_child_weight=3,
            random_state=42,
            verbosity=0,
        )

        cv_scores = cross_val_score(xgb, X, y, cv=5, scoring="neg_root_mean_squared_error")
        cv_rmse = float(-cv_scores.mean())

        xgb.fit(X, y)

        # Store in module-level model
        _model.player_stats = player_stats
        _model.player_names = player_names
        _model.player_archetypes = player_archetypes
        _model._xgb = xgb
        _model._kmeans = kmeans
        _model.is_trained = True
        _model.training_samples = len(X_rows)
        _model.cv_rmse = round(cv_rmse, 2)

        return {
            "status": "trained",
            "samples": len(X_rows),
            "players_indexed": len(player_stats),
            "cv_rmse": round(cv_rmse, 2),
        }

    except Exception as e:
        _train_error = str(e)
        raise
    finally:
        _is_training = False
        _train_lock.release()


# ---------------------------------------------------------------------------
# Prediction
# ---------------------------------------------------------------------------

def predict_lineup(player_ids: list[int]) -> dict:
    if not _model.is_trained:
        raise RuntimeError("Model not trained. Call /lineups/model/train first.")
    if len(player_ids) != 5:
        raise ValueError("Exactly 5 player IDs required.")

    feat = _lineup_features(player_ids, _model.player_stats, _model.player_archetypes)
    net_rating = float(_model._xgb.predict(feat.reshape(1, -1))[0])

    # Build per-player info
    players_info = []
    for pid in player_ids:
        s = _model.player_stats.get(pid, {})
        arch = _model.player_archetypes.get(pid, 5)
        players_info.append({
            "player_id": pid,
            "name": _model.player_names.get(pid, f"Player #{pid}"),
            "archetype": ARCHETYPE_NAMES.get(arch, "Role Player"),
            "archetype_id": arch,
            "pts": round(float(s.get("PTS", 0)), 1),
            "ast": round(float(s.get("AST", 0)), 1),
            "reb": round(float(s.get("REB", 0)), 1),
            "fg3_pct": round(float(s.get("FG3_PCT", 0)), 3),
            "blk": round(float(s.get("BLK", 0)), 1),
            "stl": round(float(s.get("STL", 0)), 1),
        })

    # Strengths / weaknesses from features
    strengths, weaknesses = _explain(player_ids)

    tier = (
        "Elite" if net_rating > 8 else
        "Strong" if net_rating > 3 else
        "Average" if net_rating > -3 else
        "Below Average" if net_rating > -8 else
        "Poor"
    )

    # Archetype balance check
    archs = [_model.player_archetypes.get(p, 5) for p in player_ids]
    arch_names = [ARCHETYPE_NAMES.get(a, "Role Player") for a in archs]
    has_playmaker = any(a == 1 for a in archs)
    has_big = any(a == 3 for a in archs)
    has_spacing = sum(1 for a in archs if a in (2, 4)) >= 2

    return {
        "predicted_net_rating": round(net_rating, 1),
        "tier": tier,
        "players": players_info,
        "strengths": strengths,
        "weaknesses": weaknesses,
        "archetype_balance": {
            "has_primary_playmaker": has_playmaker,
            "has_interior_presence": has_big,
            "has_floor_spacing": has_spacing,
            "archetypes": arch_names,
        },
        "model_info": {
            "training_samples": _model.training_samples,
            "cv_rmse": _model.cv_rmse,
            "season": SEASON,
        },
    }


def _explain(player_ids: list[int]) -> tuple[list[str], list[str]]:
    strengths, weaknesses = [], []
    stats_list = [_model.player_stats.get(p, {}) for p in player_ids]

    total_3pa  = sum(float(s.get("FG3A", 0)) for s in stats_list)
    total_ast  = sum(float(s.get("AST",  0)) for s in stats_list)
    total_blk  = sum(float(s.get("BLK",  0)) for s in stats_list)
    total_stl  = sum(float(s.get("STL",  0)) for s in stats_list)
    avg_fg3    = np.mean([float(s.get("FG3_PCT", 0)) for s in stats_list])
    avg_ts     = np.mean([float(s.get("FG_PCT",  0)) + 0.5 * float(s.get("FG3_PCT", 0)) for s in stats_list])
    pts_list   = [float(s.get("PTS", 0)) for s in stats_list]
    scoring_spread = np.std(pts_list) / max(np.mean(pts_list), 1)

    # Strengths
    if total_3pa > 15:   strengths.append(f"Elite floor spacing ({total_3pa:.0f} total 3PA)")
    if total_ast  > 15:  strengths.append(f"High playmaking depth ({total_ast:.0f} combined AST)")
    if total_blk  > 4:   strengths.append(f"Strong rim protection ({total_blk:.1f} combined BLK)")
    if total_stl  > 5:   strengths.append(f"Active passing lanes ({total_stl:.1f} combined STL)")
    if avg_fg3    > 0.37: strengths.append(f"High-efficiency 3-point shooting ({avg_fg3:.1%} avg 3P%)")
    if scoring_spread < 0.3: strengths.append("Balanced scoring load - hard to gameplan against")

    # Weaknesses
    if total_3pa  < 8:   weaknesses.append("Limited floor spacing - defense can sag into the paint")
    if total_ast  < 8:   weaknesses.append("Low combined assists - may struggle in half-court sets")
    if total_blk  < 1.5: weaknesses.append("Minimal rim protection - vulnerable to paint attacks")
    if avg_fg3    < 0.33: weaknesses.append(f"Below-average 3P% ({avg_fg3:.1%}) - spacing concerns")
    if scoring_spread > 0.5: weaknesses.append("Heavily star-dependent offense - predictable when star is off")

    archs = [_model.player_archetypes.get(p, 5) for p in player_ids]
    if archs.count(3) > 1: weaknesses.append("Two interior bigs - spacing conflicts in modern NBA")
    if archs.count(0) > 1: weaknesses.append("Multiple primary scorers - potential ball-sharing issues")
    if 1 not in archs:     weaknesses.append("No clear playmaker - half-court offense may stagnate")

    return strengths[:4], weaknesses[:4]


def search_players_from_model(query: str, limit: int = 10) -> list[dict]:
    """Search the live-fetched player pool (reflects current trades)."""
    q = query.strip().lower()
    if not q or not _model.player_names:
        return []
    results = [
        {
            "id": pid,
            "full_name": name,
            "team": _model.player_stats.get(pid, {}).get("TEAM_ABBREVIATION", ""),
        }
        for pid, name in _model.player_names.items()
        if q in name.lower()
    ]
    return sorted(results, key=lambda x: x["full_name"])[:limit]
