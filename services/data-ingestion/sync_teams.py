"""Export static team list to JSON for offline reference."""

import json
from pathlib import Path

from nba_api.stats.static import teams

OUT = Path(__file__).resolve().parents[2] / "data" / "reference" / "teams.json"


def main():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    data = teams.get_teams()
    OUT.write_text(json.dumps(data, indent=2), encoding="utf-8")
    print(f"Wrote {len(data)} teams to {OUT}")


if __name__ == "__main__":
    main()
