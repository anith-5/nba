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

from app import data_cache
from app.routers import defense_scanner, clutch_dna


def precompute_defense():
    print("[1/2] Defense Scanner — pulling league team defense…")
    df = defense_scanner._fetch_league_defense_live()
    data_cache.write_df(defense_scanner.DEFENSE_CACHE, df)
    print(f"      saved {len(df)} teams -> data_cache/{defense_scanner.DEFENSE_CACHE}")


def precompute_clutch():
    print("[2/2] Clutch DNA — pulling clutch leaderboard (takes ~30s)…")
    result = clutch_dna._fetch_leaderboard_live()
    data_cache.write_json(clutch_dna.CLUTCH_CACHE, result)
    print(f"      saved {len(result.get('players', []))} players -> data_cache/{clutch_dna.CLUTCH_CACHE}")


def main():
    t0 = time.time()
    print("=" * 60)
    print("Pre-computing NBA data snapshots for the live site")
    print("=" * 60)

    steps = [precompute_defense, precompute_clutch]
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
