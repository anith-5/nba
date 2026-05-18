from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import live, players, predictions, teams, trades

app = FastAPI(
    title="NBA Analytics Platform API",
    description="Gateway for live data, predictions, trades, and analytics.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(live.router)
app.include_router(teams.router)
app.include_router(players.router)
app.include_router(predictions.router)
app.include_router(trades.router)


@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "nba-platform-api",
        "scoreboard_fetch": "cdn+v3",
    }
