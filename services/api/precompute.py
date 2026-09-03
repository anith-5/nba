"""
Pre-compute NBA data snapshots for the live (deployed) site.

WHY: stats.nba.com blocks cloud IPs, so the deployed backend can't pull NBA
data itself. Run THIS script on your own computer (home internet — not
blocked). It saves JSON snapshots into app/../data_cache/, which you then
commit and push. The live server serves those snapshots.

USAGE (from the services/api folder):
    .venv\\Scripts\\python precompute.py            # every dataset
    .venv\\Scripts\\python precompute.py rosters    # just one (see STEPS)

The `rosters` step pulls from ESPN instead of stats.nba.com, so it is the one
dataset that can still be refreshed on a network where stats.nba.com is
blocked. Run it on its own there rather than waiting out seven failures.

Then:
    git add services/api/data_cache
    git commit -m "Refresh pre-computed NBA data"
    git push

Re-run whenever you want to refresh the live site's data (e.g. weekly).
"""

import sys
import time

from nba_api.stats.static import teams as static_teams

from app import data_cache, comp_database, lineup_model, espn_rosters
from app.routers import defense_scanner, clutch_dna, standings, draft_simulator, lineup_optimizer, trades

# Draft-history snapshots cover this range (Redraft / Historical grounding)
DRAFT_YEARS = range(1990, 2025)

# A refreshed snapshot is rejected if it came back smaller than this fraction
# of what's already on disk. 0.5 is deliberately loose: real roster churn never
# halves a dataset, so anything under it means fetches failed, not that the
# league shrank.
MIN_KEEP_RATIO = 0.5


def _count_players(blob) -> int:
    """Total players across a {team_id: {players: [...]}} snapshot.

    Rosters need this rather than len(): that counts the 30 TEAM keys, which
    stays 30 even if every roster came back empty — precisely the failure the
    guard exists to catch.
    """
    if not isinstance(blob, dict):
        return len(blob or [])
    return sum(len((t or {}).get("players") or []) for t in blob.values())


def _write_if_sane(cache_name: str, new_data, label: str, count_fn=len) -> bool:
    """Write a refreshed snapshot only if it plausibly succeeded.

    WHY THIS GUARD EXISTS: every NBA call in this script is wrapped in a
    per-item try/except so one bad team doesn't abort the run. That is the
    right behaviour for a flaky endpoint, but it means a TOTAL failure — no
    network, a blocked IP, an API shape change — looks identical to a
    successful run that simply collected nothing. The old code then wrote that
    empty result straight over a good snapshot, and since these files ARE the
    only data source on the deployed site, a single bad run could take the
    live rosters, lineups and trade pool down to nothing.

    Refusing the write leaves the previous good snapshot in place, which is
    always the better failure mode: stale data beats no data.
    """
    new_count = count_fn(new_data) if new_data is not None else 0
    old = data_cache.read_json(cache_name)
    old_count = count_fn(old) if old else 0

    if new_count == 0:
        print(f"      REFUSED to write {label}: fetched 0 records "
              f"(existing snapshot of {old_count} left untouched)")
        return False

    if old_count and new_count < old_count * MIN_KEEP_RATIO:
        print(f"      REFUSED to write {label}: only {new_count} records vs "
              f"{old_count} on disk — looks like a partial failure, "
              f"existing snapshot left untouched")
        return False

    data_cache.write_json(cache_name, new_data)
    delta = f" (was {old_count})" if old_count else ""
    print(f"      saved {new_count} records -> data_cache/{cache_name}{delta}")
    return True


def precompute_defense():
    print("[1/7] Defense Scanner — pulling league team defense…")
    df = defense_scanner._fetch_league_defense_live()
    data_cache.write_df(defense_scanner.DEFENSE_CACHE, df)
    print(f"      saved {len(df)} teams -> data_cache/{defense_scanner.DEFENSE_CACHE}")


def precompute_clutch():
    print("[2/7] Clutch DNA — pulling clutch leaderboard (takes ~30s)…")
    result = clutch_dna._fetch_leaderboard_live()
    data_cache.write_json(clutch_dna.CLUTCH_CACHE, result)
    print(f"      saved {len(result.get('players', []))} players -> data_cache/{clutch_dna.CLUTCH_CACHE}")


def precompute_standings():
    print("[3/7] Standings + scoring leaders…")
    st = standings._fetch_standings_live()
    data_cache.write_json(standings.STANDINGS_CACHE, st)
    print(f"      saved {len(st.get('East', []))} East / {len(st.get('West', []))} West teams")
    sc = standings._fetch_scoring_live()
    data_cache.write_json(standings.SCORING_CACHE, sc)
    print(f"      saved {len(sc)} scoring leaders")


def precompute_trajectory():
    print("[4/7] Player Trajectory — exporting comp database to JSON…")
    comp_database.init_database_async()
    # Wait for the DB to be loaded/built (the build can take 30-60 min the first
    # time; if comp_db.pkl already exists locally it loads instantly).
    waited = 0
    while comp_database.get_database() is None and comp_database._is_building and waited < 3600:
        time.sleep(10)
        waited += 10
    if comp_database.get_database() is None:
        print("      no comp DB available to export (build it locally first)")
        return
    n = comp_database.export_entries_json()
    print(f"      saved {n} entries -> data_cache/comp_entries.json")


def precompute_draft_history():
    print(f"[5/7] Draft history — pulling real rosters {DRAFT_YEARS.start}-{DRAFT_YEARS.stop - 1} "
          f"(grounds Redraft/Historical so wrong-year players can't appear)…")
    ok = 0
    for year in DRAFT_YEARS:
        try:
            cls = draft_simulator._fetch_draft_class_live(year)
            if cls:
                data_cache.write_json(f"draft_{year}.json", cls)
                ok += 1
        except Exception as e:
            print(f"      {year}: {e}")
    print(f"      saved {ok} draft years -> data_cache/draft_<year>.json")


def precompute_lineups():
    print("[6/7] Lineup Optimizer — training model + caching rosters/lineups…")
    lineup_model.train()
    exp = lineup_model.export_snapshot()
    print(f"      trained + exported model ({exp['players']} players, {exp['samples']} samples)")

    rosters, team_lineups = {}, {}
    for t in static_teams.get_teams():
        tid = t["id"]
        try:
            rosters[str(tid)] = lineup_optimizer._roster_live(tid)
        except Exception as e:
            print(f"      roster {t['abbreviation']}: {e}")
        try:
            team_lineups[str(tid)] = lineup_optimizer._team_lineups_live(tid)
        except Exception as e:
            print(f"      lineups {t['abbreviation']}: {e}")
    _write_if_sane(lineup_optimizer.ROSTERS_CACHE, rosters, "team rosters", _count_players)
    _write_if_sane(lineup_optimizer.TEAM_LINEUPS_CACHE, team_lineups, "team lineups")


def precompute_trades():
    print("[7/7] Trade Machine — player pool + salaries (rosters for the picker)…")
    pool = trades._fetch_pool_with_salaries_live()
    if _write_if_sane(trades.TRADES_POOL_CACHE, pool, "trade pool"):
        with_sal = sum(1 for p in pool if p.get("salary_millions") is not None)
        print(f"      ({with_sal} of {len(pool)} with salary)")


def precompute_espn_rosters():
    print("[8/8] Rosters via ESPN — independent of stats.nba.com…")
    rosters = espn_rosters.build_rosters()
    if not _write_if_sane(lineup_optimizer.ROSTERS_CACHE, rosters,
                          "team rosters (ESPN)", _count_players):
        return
    # Team assignments live in three places. Propagating only on a successful
    # write keeps them from drifting apart — a half-refreshed app that shows a
    # player on two different teams is worse than one that's uniformly stale.
    espn_rosters.propagate_team_assignments(rosters)


# Steps are addressable by name so a single dataset can be refreshed on its
# own. That matters because the NBA-backed steps are unusable on any network
# stats.nba.com blocks, while `rosters` (ESPN) still works there — without
# this you'd have to sit through seven guaranteed failures to refresh one file.
def precompute_arena_players():
    """Current-season players + traits for the Arena's Build a Player mode.

    Walks all 30 rosters, so it is slow (~2-4 min) and must run somewhere
    stats.nba.com is reachable -- i.e. not on the cloud host.
    """
    print("[arena] current players + traits...")
    from app.routers import rosters as rosters_router

    players = rosters_router.fetch_current_players()
    envelope = rosters_router._envelope(players)
    with_traits = sum(1 for p in players if p.get("traits"))
    # _count_players is for the {team_id: {players: []}} shape; this snapshot
    # is a flat envelope, so count its own list.
    def count_envelope(blob):
        return len((blob or {}).get("players") or [])

    if _write_if_sane(rosters_router.CURRENT_PLAYERS_CACHE, envelope, "arena players", count_envelope):
        print(f"      {with_traits} of {len(players)} players have traits")


STEPS = {
    "defense": precompute_defense,
    "clutch": precompute_clutch,
    "standings": precompute_standings,
    "trajectory": precompute_trajectory,
    "draft": precompute_draft_history,
    "lineups": precompute_lineups,
    "trades": precompute_trades,
    "rosters": precompute_espn_rosters,
    "arena": precompute_arena_players,
}


def main():
    t0 = time.time()
    requested = [a for a in sys.argv[1:] if not a.startswith("-")]
    unknown = [a for a in requested if a not in STEPS]
    if unknown:
        print(f"Unknown step(s): {', '.join(unknown)}")
        print(f"Available: {', '.join(STEPS)}")
        return 1

    steps = [STEPS[a] for a in requested] if requested else list(STEPS.values())

    print("=" * 60)
    print("Pre-computing NBA data snapshots for the live site")
    if requested:
        print(f"Running only: {', '.join(requested)}")
    print("=" * 60)

    for step in steps:
        try:
            step()
        except Exception as e:
            print(f"      ERROR: {e}  (skipping this dataset)")

    print("=" * 60)
    print(f"Done in {time.time() - t0:.0f}s.")
    print("Next: git add services/api/data_cache && git commit && git push")
    print("=" * 60)


if __name__ == "__main__":
    sys.exit(main())
