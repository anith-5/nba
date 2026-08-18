"""
Pre-compute NBA data snapshots for the live (deployed) site.

WHY: stats.nba.com blocks cloud IPs, so the deployed backend can't pull NBA
data itself. Run THIS script on your own computer (home internet — not
blocked). It saves JSON snapshots into app/../data_cache/, which you then
commit and push. The live server serves those snapshots.

USAGE (from the services/api folder):
    .venv\\Scripts\\python precompute.py

Then:
    git add services/api/data_cache
    git commit -m "Refresh pre-computed NBA data"
    git push

Re-run whenever you want to refresh the live site's data (e.g. weekly).
"""

import sys
import time

from nba_api.stats.static import teams as static_teams

from app import data_cache, comp_database, lineup_model
from app.routers import defense_scanner, clutch_dna, standings, draft_simulator, lineup_optimizer, trades

# Draft-history snapshots cover this range (Redraft / Historical grounding)
DRAFT_YEARS = range(1990, 2025)

# A refreshed snapshot is rejected if it came back smaller than this fraction
# of what's already on disk. 0.5 is deliberately loose: real roster churn never
# halves a dataset, so anything under it means fetches failed, not that the
# league shrank.
MIN_KEEP_RATIO = 0.5


def _write_if_sane(cache_name: str, new_data, label: str) -> bool:
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
    new_count = len(new_data) if new_data is not None else 0
    old = data_cache.read_json(cache_name)
    old_count = len(old) if old else 0

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
    _write_if_sane(lineup_optimizer.ROSTERS_CACHE, rosters, "team rosters")
    _write_if_sane(lineup_optimizer.TEAM_LINEUPS_CACHE, team_lineups, "team lineups")


def precompute_trades():
    print("[7/7] Trade Machine — player pool + salaries (rosters for the picker)…")
    pool = trades._fetch_pool_with_salaries_live()
    if _write_if_sane(trades.TRADES_POOL_CACHE, pool, "trade pool"):
        with_sal = sum(1 for p in pool if p.get("salary_millions") is not None)
        print(f"      ({with_sal} of {len(pool)} with salary)")


def main():
    t0 = time.time()
    print("=" * 60)
    print("Pre-computing NBA data snapshots for the live site")
    print("=" * 60)

    steps = [precompute_defense, precompute_clutch, precompute_standings,
             precompute_trajectory, precompute_draft_history, precompute_lineups,
             precompute_trades]
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
