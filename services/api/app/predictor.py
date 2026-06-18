from app.config import settings
"""
NBA Game Winner Predictor  " stacked logistic regression ensemble.
Ported from standalone script for use as a FastAPI service module.
"""

import time
import warnings
from datetime import datetime
from dataclasses import dataclass, field
from typing import Optional

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import cross_val_score
from sklearn.pipeline import Pipeline

from nba_api.stats.endpoints import (
    leaguedashteamstats,
    teamgamelog,
    leaguegamefinder,
    commonteamroster,
    leaguedashplayerstats,
)
from nba_api.stats.static import teams as nba_teams_static

warnings.filterwarnings("ignore")

SEASON = settings.current_season
RATE_LIMIT_SEC = 0.7
HOME_ADVANTAGE = 3.0
INJURY_MPG_LOSS = 0.012

FEATURE_WEIGHTS = {
    "rest_diff": 1.3,
    "home_advantage": 1.5,
    "last10_diff": 1.4,
    "h2h_rate": 1.2,
    "injury_diff": 1.6,
}


@dataclass
class TeamProfile:
    team_id: int
    abbreviation: str
    off_rtg: float = 0.0
    def_rtg: float = 0.0
    net_rtg: float = 0.0
    pace: float = 0.0
    last10_wins: int = 0
    last10_games: int = 10
    rest_days: int = 2
    injury_impact: float = 0.0
    h2h_wins: int = 0
    h2h_games: int = 0


@dataclass
class MatchupFeatures:
    off_rtg_diff: float
    def_rtg_diff: float
    pace_diff: float
    net_rtg_diff: float
    rest_diff: float
    home_advantage: float
    last10_diff: float
    h2h_rate: float
    injury_diff: float

    def to_array(self) -> np.ndarray:
        return np.array([
            self.off_rtg_diff,
            self.def_rtg_diff,
            self.pace_diff,
            self.net_rtg_diff,
            self.rest_diff * FEATURE_WEIGHTS["rest_diff"],
            self.home_advantage * FEATURE_WEIGHTS["home_advantage"],
            self.last10_diff * FEATURE_WEIGHTS["last10_diff"],
            self.h2h_rate * FEATURE_WEIGHTS["h2h_rate"],
            self.injury_diff * FEATURE_WEIGHTS["injury_diff"],
        ]).reshape(1, -1)


@dataclass
class Prediction:
    home_team: str
    away_team: str
    predicted_winner: str
    home_win_prob: float
    away_win_prob: float
    predicted_margin: float
    confidence: str
    features: dict = field(default_factory=dict)
    model_votes: list = field(default_factory=list)


def _sleep():
    time.sleep(RATE_LIMIT_SEC)


def get_all_team_ids() -> dict:
    return {t["abbreviation"]: t["id"] for t in nba_teams_static.get_teams()}


def fetch_league_stats(season: str = SEASON) -> pd.DataFrame:
    _sleep()
    adv = leaguedashteamstats.LeagueDashTeamStats(
        season=season,
        measure_type_detailed_defense="Advanced",
        per_mode_detailed="PerGame",
    ).get_data_frames()[0]

    _sleep()
    base = leaguedashteamstats.LeagueDashTeamStats(
        season=season,
        measure_type_detailed_defense="Base",
        per_mode_detailed="PerGame",
    ).get_data_frames()[0]

    adv = adv[["TEAM_ID", "TEAM_NAME", "OFF_RATING", "DEF_RATING", "NET_RATING", "PACE"]].copy()
    base = base[["TEAM_ID", "W", "L", "W_PCT"]].copy()
    merged = adv.merge(base, on="TEAM_ID")
    merged.set_index("TEAM_ID", inplace=True)
    return merged


def fetch_last_n_games(team_id: int, n: int = 10, season: str = SEASON) -> pd.DataFrame:
    _sleep()
    log = teamgamelog.TeamGameLog(
        team_id=team_id,
        season=season,
        season_type_all_star="Playoffs" if _is_playoffs() else "Regular Season",
    ).get_data_frames()[0]
    return log.head(n)


def _is_playoffs() -> bool:
    return datetime.today().month in (4, 5, 6)


def compute_rest_days(team_id: int, game_date: Optional[datetime] = None,
                      season: str = SEASON) -> int:
    if game_date is None:
        game_date = datetime.today()
    try:
        log = fetch_last_n_games(team_id, n=5, season=season)
        if log.empty:
            return 2
        last_date = pd.to_datetime(log.iloc[0]["GAME_DATE"], format="%b %d, %Y")
        delta = (game_date - last_date).days
        return min(max(delta, 0), 7)
    except Exception:
        return 2


def fetch_head_to_head(home_id: int, away_id: int,
                       season: str = SEASON) -> tuple:
    _sleep()
    try:
        finder = leaguegamefinder.LeagueGameFinder(
            team_id_nullable=home_id,
            vs_team_id_nullable=away_id,
            season_nullable=season,
            season_type_nullable="Regular Season",
        ).get_data_frames()[0]

        if finder.empty:
            return 0, 0

        home_wins = (finder["WL"] == "W").sum()
        total = len(finder)
        return int(home_wins), int(total)
    except Exception:
        return 0, 0


def fetch_injury_impact(team_id: int, season: str = SEASON) -> float:
    _sleep()
    try:
        roster_df = commonteamroster.CommonTeamRoster(
            team_id=team_id,
            season=season,
        ).get_data_frames()[0]

        roster_ids = set(roster_df["PLAYER_ID"].tolist())

        _sleep()
        pstats = leaguedashplayerstats.LeagueDashPlayerStats(
            season=season,
            per_mode_detailed="PerGame",
        ).get_data_frames()[0]

        team_pstats = pstats[pstats["TEAM_ID"] == team_id]
        avg_mpg = float(team_pstats["MIN"].mean()) if not team_pstats.empty else 20.0

        active_ids = set(team_pstats[team_pstats["GP"] > 0]["PLAYER_ID"].tolist())
        inactive_ids = roster_ids - active_ids
        return round(len(inactive_ids) * avg_mpg * 0.5, 2)
    except Exception:
        return 0.0


def build_team_profile(team_id: int, abbrev: str,
                       league_df: pd.DataFrame,
                       game_date: Optional[datetime] = None,
                       season: str = SEASON) -> TeamProfile:
    profile = TeamProfile(team_id=team_id, abbreviation=abbrev)

    if team_id in league_df.index:
        row = league_df.loc[team_id]
        profile.off_rtg = float(row["OFF_RATING"])
        profile.def_rtg = float(row["DEF_RATING"])
        profile.net_rtg = float(row["NET_RATING"])
        profile.pace = float(row["PACE"])

    try:
        log = fetch_last_n_games(team_id, n=10, season=season)
        if not log.empty:
            profile.last10_wins = int((log["WL"] == "W").sum())
            profile.last10_games = len(log)
    except Exception:
        pass

    profile.rest_days = compute_rest_days(team_id, game_date, season)
    profile.injury_impact = fetch_injury_impact(team_id, season)
    return profile


def build_matchup_features(home: TeamProfile,
                            away: TeamProfile,
                            h2h_wins: int,
                            h2h_games: int) -> MatchupFeatures:
    home_l10 = home.last10_wins / max(home.last10_games, 1)
    away_l10 = away.last10_wins / max(away.last10_games, 1)
    h2h_rate = h2h_wins / h2h_games if h2h_games > 0 else 0.5

    return MatchupFeatures(
        off_rtg_diff=home.off_rtg - away.off_rtg,
        def_rtg_diff=home.def_rtg - away.def_rtg,
        pace_diff=home.pace - away.pace,
        net_rtg_diff=home.net_rtg - away.net_rtg,
        rest_diff=home.rest_days - away.rest_days,
        home_advantage=HOME_ADVANTAGE,
        last10_diff=home_l10 - away_l10,
        h2h_rate=h2h_rate,
        injury_diff=home.injury_impact - away.injury_impact,
    )


def _make_base_model(C: float, solver: str, max_iter: int) -> Pipeline:
    return Pipeline([
        ("scaler", StandardScaler()),
        ("lr", LogisticRegression(C=C, solver=solver,
                                  max_iter=max_iter, random_state=42)),
    ])


class StackedNBAPredictor:
    def __init__(self):
        self.models = [
            _make_base_model(C=0.5, solver="lbfgs", max_iter=1000),
            _make_base_model(C=1.0, solver="saga", max_iter=1000),
            _make_base_model(C=2.0, solver="liblinear", max_iter=500),
        ]
        self.is_fitted = False
        self._train_acc: list = []

    def train(self, X: np.ndarray, y: np.ndarray) -> dict:
        results = {}
        for i, model in enumerate(self.models):
            scores = cross_val_score(model, X, y, cv=5, scoring="accuracy")
            model.fit(X, y)
            self._train_acc.append(scores.mean())
            results[f"model_{i + 1}"] = {
                "cv_accuracy": round(scores.mean(), 4),
                "cv_std": round(scores.std(), 4),
            }
        self.is_fitted = True
        return results

    def predict_proba(self, X: np.ndarray) -> float:
        assert self.is_fitted
        probs = [m.predict_proba(X)[0][1] for m in self.models]
        return float(np.mean(probs))

    def predict_votes(self, X: np.ndarray) -> list:
        return [round(float(m.predict_proba(X)[0][1]), 3) for m in self.models]

    @staticmethod
    def estimate_margin(home_win_prob: float, features: MatchupFeatures) -> float:
        prob_margin = (home_win_prob - 0.5) * 2 * 15
        rating_margin = features.net_rtg_diff * 0.4
        raw = prob_margin + rating_margin + features.home_advantage * 0.3
        return round(raw, 1)


def build_historical_training_data(season: str = SEASON,
                                   league_df: Optional[pd.DataFrame] = None
                                   ) -> tuple:
    if league_df is None:
        league_df = fetch_league_stats(season)

    _sleep()
    finder = leaguegamefinder.LeagueGameFinder(
        season_nullable=season,
        season_type_nullable="Regular Season",
        league_id_nullable="00",
    ).get_data_frames()[0]

    home_games = finder[finder["MATCHUP"].str.contains(r"vs\.", regex=True)].copy()
    home_games = home_games[home_games["WL"].isin(["W", "L"])]

    team_ids = get_all_team_ids()
    id_to_abbrev = {v: k for k, v in team_ids.items()}

    X_rows, y_rows = [], []

    for _, row in home_games.iterrows():
        try:
            home_id = int(row["TEAM_ID"])
            home_abbr = id_to_abbrev.get(home_id, "UNK")

            parts = str(row["MATCHUP"]).split(" vs. ")
            if len(parts) != 2:
                continue
            away_abbr = parts[1].strip()
            away_id = team_ids.get(away_abbr)
            if away_id is None or home_id not in league_df.index or away_id not in league_df.index:
                continue

            home_prof = TeamProfile(
                team_id=home_id, abbreviation=home_abbr,
                off_rtg=float(league_df.loc[home_id, "OFF_RATING"]),
                def_rtg=float(league_df.loc[home_id, "DEF_RATING"]),
                net_rtg=float(league_df.loc[home_id, "NET_RATING"]),
                pace=float(league_df.loc[home_id, "PACE"]),
                last10_wins=5, last10_games=10, rest_days=2, injury_impact=0.0,
            )
            away_prof = TeamProfile(
                team_id=away_id, abbreviation=away_abbr,
                off_rtg=float(league_df.loc[away_id, "OFF_RATING"]),
                def_rtg=float(league_df.loc[away_id, "DEF_RATING"]),
                net_rtg=float(league_df.loc[away_id, "NET_RATING"]),
                pace=float(league_df.loc[away_id, "PACE"]),
                last10_wins=5, last10_games=10, rest_days=2, injury_impact=0.0,
            )

            feats = build_matchup_features(home_prof, away_prof, 0, 0)
            label = 1 if row["WL"] == "W" else 0
            X_rows.append(feats.to_array().flatten())
            y_rows.append(label)
        except Exception:
            continue

    return np.array(X_rows), np.array(y_rows)


class NBAGamePredictor:
    def __init__(self, season: str = SEASON):
        self.season = season
        self.model = StackedNBAPredictor()
        self.league_df = None
        self.team_ids = get_all_team_ids()

    def setup(self) -> dict:
        self.league_df = fetch_league_stats(self.season)
        X, y = build_historical_training_data(self.season, self.league_df)
        if len(X) < 10:
            raise RuntimeError("Not enough training data. Season may not have started yet.")
        return self.model.train(X, y)

    def predict(self, home_abbr: str, away_abbr: str,
                game_date: Optional[datetime] = None,
                verbose: bool = False) -> Prediction:
        if not self.model.is_fitted:
            raise RuntimeError("Call .setup() first.")

        home_abbr = home_abbr.upper()
        away_abbr = away_abbr.upper()
        game_date = game_date or datetime.today()

        home_id = self.team_ids.get(home_abbr)
        away_id = self.team_ids.get(away_abbr)
        if not home_id:
            raise ValueError(f"Unknown team: {home_abbr}")
        if not away_id:
            raise ValueError(f"Unknown team: {away_abbr}")

        home_profile = build_team_profile(home_id, home_abbr,
                                          self.league_df, game_date, self.season)
        away_profile = build_team_profile(away_id, away_abbr,
                                          self.league_df, game_date, self.season)

        h2h_wins, h2h_games = fetch_head_to_head(home_id, away_id, self.season)
        features = build_matchup_features(home_profile, away_profile, h2h_wins, h2h_games)
        X = features.to_array()

        home_prob = self.model.predict_proba(X)
        away_prob = 1.0 - home_prob
        model_votes = self.model.predict_votes(X)
        margin = self.model.estimate_margin(home_prob, features)
        winner = home_abbr if home_prob >= 0.5 else away_abbr

        prob_gap = abs(home_prob - 0.5)
        confidence = "Low" if prob_gap < 0.07 else "Medium" if prob_gap < 0.15 else "High"

        return Prediction(
            home_team=home_abbr,
            away_team=away_abbr,
            predicted_winner=winner,
            home_win_prob=round(home_prob, 3),
            away_win_prob=round(away_prob, 3),
            predicted_margin=abs(margin),
            confidence=confidence,
            model_votes=model_votes,
            features={
                "off_rtg_diff": round(features.off_rtg_diff, 2),
                "def_rtg_diff": round(features.def_rtg_diff, 2),
                "net_rtg_diff": round(features.net_rtg_diff, 2),
                "pace_diff": round(features.pace_diff, 2),
                "rest_diff": int(features.rest_diff),
                "home_advantage": features.home_advantage,
                "last10_diff": round(features.last10_diff, 3),
                "h2h_rate": round(features.h2h_rate, 3),
                "injury_diff": round(features.injury_diff, 2),
                "home_rest_days": home_profile.rest_days,
                "away_rest_days": away_profile.rest_days,
                "home_last10": f"{home_profile.last10_wins}-{home_profile.last10_games - home_profile.last10_wins}",
                "away_last10": f"{away_profile.last10_wins}-{away_profile.last10_games - away_profile.last10_wins}",
                "h2h_record": f"{h2h_wins}-{h2h_games - h2h_wins} (home)",
            },
        )


