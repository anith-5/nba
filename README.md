# NBA Analytics Platform

A full-stack NBA analytics ecosystem: game predictions, trade machine, shot charts, GM simulator, research hub, and community features.

**This project lives separately from `cybertraining-platform`.**

## Stack

| Layer | Tech |
|-------|------|
| Frontend | Vite, React, Tailwind CSS, React Router |
| API | FastAPI, Python 3.11+ |
| Data | [nba_api](https://github.com/swar/nba_api) (NBA.com stats) |
| Future | PostgreSQL, scikit-learn/XGBoost, D3 shot maps |

## Project layout

```
nba-platform/
├── apps/web/                 # React frontend
├── services/api/             # FastAPI gateway
├── services/data-ingestion/  # Sync jobs for historical data
├── packages/cba-rules/       # Salary cap / trade validation (stub)
├── data/reference/           # Cap tables, constants (add over time)
└── docs/                     # Architecture & team docs
```

## Prerequisites

- Python 3.11+
- Node.js 18+
- Network access (nba_api calls NBA.com)

## Quick start

### 1. API (terminal 1)

```powershell
cd services\api
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload --host 0.0.0.0 --port 8001
```

Docs: http://localhost:8001/docs

### 2. Web (terminal 2)

```powershell
cd apps\web
npm install
npm run dev
```

Open http://localhost:5174

## API routes (Phase 0)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/live/scoreboard` | Today's games (nba_api live) |
| GET | `/teams` | All NBA teams |
| GET | `/players/search?q=` | Search players by name |
| GET | `/players/{player_id}/profile` | Player career summary |
| POST | `/predictions/game` | Baseline win probability (heuristic) |
| POST | `/trades/validate` | Basic trade validation stub |

## Team ownership

See [docs/TEAM_OWNERSHIP.md](docs/TEAM_OWNERSHIP.md).

## Data & terms

`nba_api` wraps unofficial NBA.com endpoints. Cache responses in production, respect rate limits, and review [NBA.com Terms of Use](https://www.nba.com/termsofuse).

## Roadmap

1. **Phase 0** (current) — Shell UI, live scoreboard, player search, baseline prediction stub  
2. **Phase 1** — Shot chart lab, team dashboards, research MDX  
3. **Phase 2** — Trade machine + CBA rules  
4. **Phase 3** — ML prediction pipeline  
5. **Phase 4** — GM dynasty simulator  
6. **Phase 5** — Community & auth  
