"""Team power rankings: opponent-adjusted strength plus a Four Factors projection.

Two numbers per team, deliberately kept separate because they answer different
questions:

  Strength (SRS)   -- how good has this team actually been, once you correct for
                      who they played and where. This is the ranking.
  Projection (4F)  -- what the Four Factors say they should be going forward.

They disagree in a useful way. The Four Factors components stabilise at very
different speeds: turnover rate, rebounding rate and free-throw rate settle
within roughly 15-20 games, while effective field-goal percentage stays noisy
and regresses hard. So early in a season the projection is the better guide and
by the end the results-based rating is. A team whose projection sits well above
its strength has been losing games its underlying play did not deserve to lose.

Everything here is derived from four league-wide calls, so it is cheap to
refresh; see precompute.py's "power" step.
"""

from __future__ import annotations

import logging
import math
from collections import defaultdict
from datetime import datetime, timezone

from nba_api.stats.endpoints import (
    leaguedashteamstats,
    leaguedashplayerstats,
    leaguegamelog,
)

from app import data_cache
from app.utils.season import (
    get_current_nba_season,
    get_current_nba_season_start_year,
    season_string_for_start_year,
)

logger = logging.getLogger(__name__)

POWER_CACHE = "power_rankings.json"

# --- Four Factors weights -------------------------------------------------
# Dean Oliver's original rule of thumb. They are approximately right and widely
# understood, which is why they are the default, but they date from 2004 and
# modern fits put shooting higher and offensive rebounding lower (teams now
# concede offensive boards to set their transition defence). Kept as named
# constants so the weighting can be retuned in one place.
W_SHOOTING = 0.40
W_TURNOVERS = 0.25
W_REBOUNDING = 0.20
W_FREE_THROWS = 0.15

# --- Strength-rating knobs ------------------------------------------------
# A 46-point win says almost nothing more about a team than a 20-point win does,
# but left uncapped it drags the average around. Capping margin is standard
# practice in rating systems for exactly this reason.
MARGIN_CAP = 20.0
# Iterations for the opponent adjustment. It is a contraction mapping, so this
# converges quickly; 25 is far past the point where the ratings stop moving.
SRS_ITERATIONS = 25
# Below this share of last season's minutes still on the roster, a results-based
# rating is describing a team that no longer exists.
CONTINUITY_FLAG_THRESHOLD = 0.70


def _num(value, default=0.0) -> float:
    try:
        out = float(value)
    except (TypeError, ValueError):
        return default
    return default if math.isnan(out) else out


# --------------------------------------------------------------------------
# Live fetches
# --------------------------------------------------------------------------
def _fetch_team_table(season: str, measure: str):
    return leaguedashteamstats.LeagueDashTeamStats(
        season=season,
        measure_type_detailed_defense=measure,
        per_mode_detailed="Totals",
        timeout=90,
    ).get_data_frames()[0]


def _fetch_game_log(season: str):
    return leaguegamelog.LeagueGameLog(
        season=season,
        season_type_all_star="Regular Season",
        player_or_team_abbreviation="T",
        timeout=120,
    ).get_data_frames()[0]


def _fetch_player_minutes(season: str):
    return leaguedashplayerstats.LeagueDashPlayerStats(
        season=season,
        per_mode_detailed="Totals",
        timeout=90,
    ).get_data_frames()[0]


# --------------------------------------------------------------------------
# Game-level derivations: margin, home/road, rest, schedule
# --------------------------------------------------------------------------
def _parse_games(df) -> dict:
    """Fold the game log into per-team game lists.

    The log holds two rows per game, one per side. Pairing them by GAME_ID is
    what turns "points scored" into "margin", which is the only thing the rating
    actually needs.
    """
    by_game = defaultdict(list)
    for row in df.itertuples(index=False):
        by_game[row.GAME_ID].append(row)

    teams = defaultdict(list)
    for game_id, rows in by_game.items():
        if len(rows) != 2:
            # A game missing its other half cannot produce a margin; skipping it
            # is better than inventing an opponent score.
            continue
        for side, other in ((rows[0], rows[1]), (rows[1], rows[0])):
            matchup = str(getattr(side, "MATCHUP", "") or "")
            teams[str(side.TEAM_ABBREVIATION)].append({
                "game_id": game_id,
                "date": str(getattr(side, "GAME_DATE", ""))[:10],
                "opponent": str(other.TEAM_ABBREVIATION),
                # "LAL vs. GSW" is home, "LAL @ GSW" is away.
                "home": "vs." in matchup,
                "pts": _num(side.PTS),
                "opp_pts": _num(other.PTS),
                "won": str(getattr(side, "WL", "")) == "W",
            })

    for games in teams.values():
        games.sort(key=lambda g: g["date"])
    return teams


def _rest_days(games: list[dict]) -> list[int]:
    """Days off before each game. The first game of the season has no prior
    game, so it is reported as fully rested rather than as a back-to-back."""
    out = []
    previous = None
    for game in games:
        if previous is None:
            out.append(3)
        else:
            try:
                delta = (datetime.strptime(game["date"], "%Y-%m-%d")
                         - datetime.strptime(previous, "%Y-%m-%d")).days
            except ValueError:
                delta = 3
            out.append(max(0, delta - 1))
        previous = game["date"]
    return out


def _team_splits(games: list[dict]) -> dict:
    """Home/road and rest splits for one team."""
    home = [g for g in games if g["home"]]
    road = [g for g in games if not g["home"]]

    def margin(rows):
        return sum(g["pts"] - g["opp_pts"] for g in rows) / len(rows) if rows else 0.0

    rest = _rest_days(games)
    b2b = [g for g, r in zip(games, rest) if r == 0]
    rested = [g for g, r in zip(games, rest) if r >= 1]

    return {
        "games": len(games),
        "wins": sum(1 for g in games if g["won"]),
        "losses": sum(1 for g in games if not g["won"]),
        "ppg": round(sum(g["pts"] for g in games) / len(games), 1) if games else 0.0,
        "opp_ppg": round(sum(g["opp_pts"] for g in games) / len(games), 1) if games else 0.0,
        "mov": round(margin(games), 2),
        "home_record": f"{sum(1 for g in home if g['won'])}-{sum(1 for g in home if not g['won'])}",
        "road_record": f"{sum(1 for g in road if g['won'])}-{sum(1 for g in road if not g['won'])}",
        "home_mov": round(margin(home), 2),
        "road_mov": round(margin(road), 2),
        # The gap between how a team plays at home and on the road, halved --
        # the standard way to express a home-court edge as points applied to
        # each side of a game rather than to the pair of them.
        "home_edge": round((margin(home) - margin(road)) / 2, 2),
        "b2b_record": f"{sum(1 for g in b2b if g['won'])}-{sum(1 for g in b2b if not g['won'])}",
        "rested_record": f"{sum(1 for g in rested if g['won'])}-{sum(1 for g in rested if not g['won'])}",
    }


def _league_home_edge(teams: dict) -> float:
    """League-wide home advantage in points, measured rather than assumed.

    Averaging every team's home margin against its own road margin cancels team
    quality out: each team appears on both sides.
    """
    diffs = []
    for games in teams.values():
        home = [g["pts"] - g["opp_pts"] for g in games if g["home"]]
        road = [g["pts"] - g["opp_pts"] for g in games if not g["home"]]
        if home and road:
            diffs.append((sum(home) / len(home) - sum(road) / len(road)) / 2)
    return sum(diffs) / len(diffs) if diffs else 0.0


def _simple_rating(teams: dict, home_edge: float) -> tuple[dict, dict]:
    """Opponent-adjusted margin (SRS), and the schedule strength implied by it.

    Each team's rating is its average margin plus the average rating of everyone
    it played, solved by iteration. Margins are capped first and corrected for
    venue, so a rating answers "points better than average against a neutral
    opponent at a neutral site".

    This makes a separate strength-of-schedule input unnecessary: opponent
    quality is not a term bolted on afterwards, it is what the adjustment is.
    """
    neutral = {}
    for abbr, games in teams.items():
        rows = []
        for game in games:
            raw = game["pts"] - game["opp_pts"]
            capped = max(-MARGIN_CAP, min(MARGIN_CAP, raw))
            rows.append({
                "opponent": game["opponent"],
                # Beating someone at home is worth less than beating them away.
                "margin": capped - (home_edge if game["home"] else -home_edge),
            })
        neutral[abbr] = rows

    ratings = {
        abbr: (sum(r["margin"] for r in rows) / len(rows) if rows else 0.0)
        for abbr, rows in neutral.items()
    }

    for _ in range(SRS_ITERATIONS):
        updated = {}
        for abbr, rows in neutral.items():
            if not rows:
                updated[abbr] = 0.0
                continue
            updated[abbr] = sum(
                r["margin"] + ratings.get(r["opponent"], 0.0) for r in rows
            ) / len(rows)
        # Re-centre on zero so the scale stays "points better than average".
        shift = sum(updated.values()) / len(updated) if updated else 0.0
        ratings = {a: v - shift for a, v in updated.items()}

    sos = {}
    for abbr, rows in neutral.items():
        sos[abbr] = (
            sum(ratings.get(r["opponent"], 0.0) for r in rows) / len(rows)
            if rows else 0.0
        )
    return ratings, sos


# --------------------------------------------------------------------------
# Four Factors
# --------------------------------------------------------------------------
def _four_factor_diffs(row) -> dict:
    """Each factor as a differential: the team's own figure minus what it allowed.

    Using a team's own four factors alone would rank offences, not teams -- a
    good shooting team that defends nothing would sit near the top. The sign
    conventions differ between factors and are easy to get backwards:

      shooting    team eFG% - opponent eFG%    (out-shooting them is good)
      turnovers   opponent TOV% - team TOV%    (turning it over is bad, forcing
                                                turnovers is good, so this one
                                                is subtracted the other way)
      rebounding  team OREB% - opponent OREB%  (their OREB% is what you failed
                                                to defensively rebound)
      free throws team FTA rate - opponent FTA rate
    """
    return {
        "shooting": _num(row.EFG_PCT) - _num(row.OPP_EFG_PCT),
        "turnovers": _num(row.OPP_TOV_PCT) - _num(row.TM_TOV_PCT),
        "rebounding": _num(row.OREB_PCT) - _num(row.OPP_OREB_PCT),
        "free_throws": _num(row.FTA_RATE) - _num(row.OPP_FTA_RATE),
    }


def _z_scores(values: dict) -> dict:
    """Standardise so the four factors -- which live on different scales -- can
    be weighted against each other."""
    nums = list(values.values())
    if not nums:
        return {}
    mean = sum(nums) / len(nums)
    variance = sum((v - mean) ** 2 for v in nums) / len(nums)
    sd = math.sqrt(variance)
    if sd == 0:
        return {k: 0.0 for k in values}
    return {k: (v - mean) / sd for k, v in values.items()}


# --------------------------------------------------------------------------
# Roster continuity
# --------------------------------------------------------------------------
def _fetch_season_rosters(season: str) -> dict:
    """player_id -> team abbreviation for a given season.

    One call per team. Paced deliberately: firing thirty roster requests at
    stats.nba.com back to back is a reliable way to get the IP throttled, which
    would take down every other live feature with it.

    Deliberately not reusing the arena's `current_players.json` snapshot. That
    file is built for whatever `get_current_nba_season()` returns, which through
    the offseason is the season that just *ended* -- so comparing against it
    would match a season's minutes to its own rosters and report ~100%
    continuity for all thirty teams, which is not a measurement.
    """
    import time

    from nba_api.stats.endpoints import commonteamroster
    from nba_api.stats.static import teams as static_teams

    out: dict[int, str] = {}
    for i, team in enumerate(static_teams.get_teams()):
        if i:
            time.sleep(0.6)
        try:
            df = commonteamroster.CommonTeamRoster(
                team_id=team["id"], season=season, timeout=60
            ).get_data_frames()[0]
        except Exception:
            logger.warning("power rankings: roster fetch failed for %s %s",
                           team["abbreviation"], season)
            continue
        for row in df.itertuples(index=False):
            try:
                out[int(getattr(row, "PLAYER_ID"))] = team["abbreviation"]
            except (TypeError, ValueError):
                continue
    return out


def _roster_continuity(minutes_df, roster: dict) -> dict:
    """Share of each team's minutes from the ranked season still on its roster.

    A rating built on results describes the team that played those games. After
    an offseason that can be a meaningfully different team, and this is the
    honest way to say so rather than silently pretending the ranking is current.
    """
    if not roster:
        return {}

    total = defaultdict(float)
    retained = defaultdict(float)
    for row in minutes_df.itertuples(index=False):
        abbr = str(getattr(row, "TEAM_ABBREVIATION", "") or "")
        mins = _num(getattr(row, "MIN", 0))
        if not abbr or mins <= 0:
            continue
        total[abbr] += mins
        try:
            pid = int(getattr(row, "PLAYER_ID"))
        except (TypeError, ValueError):
            continue
        if roster.get(pid) == abbr:
            retained[abbr] += mins

    return {
        abbr: round(retained[abbr] / total[abbr], 3)
        for abbr in total
        if total[abbr] > 0
    }


# --------------------------------------------------------------------------
# Assembly
# --------------------------------------------------------------------------
def _build_for_season(season: str, roster_season: str | None = None) -> dict | None:
    """Returns None when the season has not produced any games yet.

    `roster_season` is the season to measure roster continuity against. It is
    only meaningful when ranking a season that has already finished: comparing
    an in-progress season to its own rosters would measure nothing.
    """
    log_df = _fetch_game_log(season)
    if log_df is None or log_df.empty:
        return None

    teams = _parse_games(log_df)
    if not teams:
        return None

    advanced = _fetch_team_table(season, "Advanced")
    factors = _fetch_team_table(season, "Four Factors")

    continuity = {}
    if roster_season:
        try:
            continuity = _roster_continuity(
                _fetch_player_minutes(season), _fetch_season_rosters(roster_season)
            )
        except Exception:
            # Continuity is context, not the ranking. Losing it should not cost
            # the page its actual content.
            logger.warning("power rankings: roster continuity unavailable", exc_info=True)
            continuity = {}

    adv_by_id = {int(r.TEAM_ID): r for r in advanced.itertuples(index=False)}
    fac_by_id = {int(r.TEAM_ID): r for r in factors.itertuples(index=False)}

    # The game log keys on abbreviation, the stat tables on team id.
    abbr_by_id = {}
    for row in log_df.itertuples(index=False):
        abbr_by_id[int(row.TEAM_ID)] = str(row.TEAM_ABBREVIATION)

    home_edge = _league_home_edge(teams)
    ratings, sos = _simple_rating(teams, home_edge)

    raw_diffs = {}
    for team_id, row in fac_by_id.items():
        abbr = abbr_by_id.get(team_id)
        if abbr:
            raw_diffs[abbr] = _four_factor_diffs(row)

    z_by_factor = {
        factor: _z_scores({a: d[factor] for a, d in raw_diffs.items()})
        for factor in ("shooting", "turnovers", "rebounding", "free_throws")
    }

    rows = []
    for team_id, abbr in abbr_by_id.items():
        games = teams.get(abbr)
        if not games:
            continue
        adv = adv_by_id.get(team_id)
        splits = _team_splits(games)
        diffs = raw_diffs.get(abbr, {})
        z = {f: z_by_factor[f].get(abbr, 0.0) for f in z_by_factor}

        projection = (
            W_SHOOTING * z["shooting"]
            + W_TURNOVERS * z["turnovers"]
            + W_REBOUNDING * z["rebounding"]
            + W_FREE_THROWS * z["free_throws"]
        )

        rows.append({
            "team_id": team_id,
            "tri": abbr,
            "name": str(adv.TEAM_NAME) if adv is not None else abbr,
            **splits,
            "strength": round(ratings.get(abbr, 0.0), 2),
            "sos": round(sos.get(abbr, 0.0), 2),
            "off_rating": round(_num(getattr(adv, "OFF_RATING", 0)), 1) if adv is not None else 0.0,
            "def_rating": round(_num(getattr(adv, "DEF_RATING", 0)), 1) if adv is not None else 0.0,
            "net_rating": round(_num(getattr(adv, "NET_RATING", 0)), 1) if adv is not None else 0.0,
            "pace": round(_num(getattr(adv, "PACE", 0)), 1) if adv is not None else 0.0,
            "projection": round(projection, 3),
            "factors": {
                f: {"diff": round(diffs.get(f, 0.0), 4), "z": round(z[f], 2)}
                for f in z
            },
            "continuity": continuity.get(abbr),
            "continuity_flag": (
                continuity.get(abbr) is not None
                and continuity[abbr] < CONTINUITY_FLAG_THRESHOLD
            ),
        })

    rows.sort(key=lambda r: -r["strength"])
    for i, row in enumerate(rows, start=1):
        row["rank"] = i

    # Rank within each factor so a team's profile is readable without having to
    # compare raw rates across 30 rows.
    for factor in ("shooting", "turnovers", "rebounding", "free_throws"):
        for i, row in enumerate(
            sorted(rows, key=lambda r: -r["factors"][factor]["z"]), start=1
        ):
            row["factors"][factor]["rank"] = i
    for i, row in enumerate(sorted(rows, key=lambda r: -r["projection"]), start=1):
        row["projection_rank"] = i

    return {
        "season": season,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "league_home_edge": round(home_edge, 2),
        "weights": {
            "shooting": W_SHOOTING,
            "turnovers": W_TURNOVERS,
            "rebounding": W_REBOUNDING,
            "free_throws": W_FREE_THROWS,
        },
        "teams": rows,
    }


def _season_complete(data: dict) -> bool:
    """Has every team finished its schedule?

    Used to decide whether an offseason separates the games being ranked from
    the rosters that exist now. 82 is not hardcoded as a requirement -- lockout
    and pandemic seasons were shorter -- so this asks whether every team has
    stopped playing at the same number rather than whether that number is 82.
    """
    counts = {t.get("games", 0) for t in data.get("teams") or []}
    return len(counts) == 1 and counts.pop() >= 65


def _attach_continuity(data: dict, ranked_season: str, roster_season: str) -> None:
    """Fill in each team's continuity in place. Best-effort: the ranking is the
    content, and losing this should cost the page a caveat, not its table."""
    try:
        continuity = _roster_continuity(
            _fetch_player_minutes(ranked_season), _fetch_season_rosters(roster_season)
        )
    except Exception:
        logger.warning("power rankings: roster continuity unavailable", exc_info=True)
        return
    if not continuity:
        return
    for team in data.get("teams") or []:
        value = continuity.get(team["tri"])
        team["continuity"] = value
        team["continuity_flag"] = value is not None and value < CONTINUITY_FLAG_THRESHOLD


def fetch_power_rankings_live() -> dict:
    """Current season if it has started, otherwise the season just finished.

    Between the June finals and late-October tip-off there is no current-season
    game to rank, so the honest thing is to rank the season that just ended and
    say that is what is on screen. The switch happens on its own the moment real
    games exist.
    """
    season = get_current_nba_season()
    next_season = season_string_for_start_year(get_current_nba_season_start_year() + 1)

    # `get_current_nba_season` keeps returning the season that just ended all
    # through July-September, which is what we want to rank -- there is nothing
    # else to rank until October. But it means "which season" does not tell us
    # whether an offseason has happened since those games were played. Whether
    # the season is *complete* does.
    probe = _build_for_season(season)
    if probe is None:
        prior = season_string_for_start_year(get_current_nba_season_start_year() - 1)
        logger.info("power rankings: %s has no games yet, ranking %s", season, prior)
        probe = _build_for_season(prior, roster_season=season)
        if probe is None:
            raise RuntimeError(f"no game data for {season} or {prior}")
        probe["is_prior_season"] = True
        probe["roster_season"] = season
        return probe

    if _season_complete(probe):
        # Every game is played, so the rosters that produced this rating have
        # already been broken up by an offseason. Measure the gap against the
        # squads about to take the floor.
        logger.info("power rankings: %s is complete, measuring continuity vs %s",
                    season, next_season)
        _attach_continuity(probe, season, next_season)
        probe["is_prior_season"] = True
        probe["roster_season"] = next_season
        return probe

    probe["is_prior_season"] = False
    probe["roster_season"] = None
    return probe


def get_power_rankings() -> dict:
    return data_cache.cached_or_live(POWER_CACHE, fetch_power_rankings_live, kind="json")
