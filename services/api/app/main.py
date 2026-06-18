from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import comp_database
from app.config import settings
from app.routers import live, players, predictions, teams, trades
from app.routers import (
    shot_quality,
    win_probability,
    lineup_optimizer,
    defense_scanner,
    player_trajectory,
    clutch_dna,
    scouting_report,
    prospects,
    rule_simulator,
    gm_assistant,
)

@asynccontextmanager
async def lifespan(app: FastAPI):
    comp_database.init_database_async()
    yield

app = FastAPI(
    title="HoopIQ API",
    description="NBA analytics platform - 11 AI/ML features.",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Original routers
app.include_router(live.router)
app.include_router(teams.router)
app.include_router(players.router)
app.include_router(predictions.router)
app.include_router(trades.router)

# New feature routers
app.include_router(shot_quality.router)
app.include_router(win_probability.router)
app.include_router(lineup_optimizer.router)
app.include_router(defense_scanner.router)
app.include_router(player_trajectory.router)
app.include_router(clutch_dna.router)
app.include_router(scouting_report.router)
app.include_router(prospects.router)
app.include_router(rule_simulator.router)
app.include_router(gm_assistant.router)


@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "hoopiq-api",
        "version": "2.0.0",
        "features": 11,
    }
