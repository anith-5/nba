# Team ownership

Map work to the four roles on your team.

| Area | Folder | Owner focus |
|------|--------|-------------|
| Frontend | `apps/web/` | UI, routing, charts, trade builder UX |
| Backend / data | `services/api/`, `services/data-ingestion/` | APIs, caching, PostgreSQL (later) |
| ML / analytics | `services/api/app/routers/predictions.py`, future `services/ml/` | Models, features, evaluation |
| Research / media | `docs/`, future `apps/web/src/pages/Research.jsx` content | Articles, notebooks, social embeds |

## Suggested first tickets

1. **FE** — Polish home dashboard + game detail drawer  
2. **BE** — Cache scoreboard in Redis; add `GET /games/{id}`  
3. **ML** — Replace heuristic predictor with XGBoost on 2023–24 season  
4. **Research** — First article: "Home court advantage by decade" with one API-driven chart  
