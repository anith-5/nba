from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app import comp_database
from app import lineup_model
from app.config import settings
from app.limits import limiter
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
    draft_simulator,
    standings,
    draft_comp,
    rosters,
    team_players,
)

@asynccontextmanager
async def lifespan(app: FastAPI):
    comp_database.init_database_async()
    # Load the pre-trained lineup model so the site is "trained" without a live
    # NBA pull (works on the cloud where NBA is blocked).
    lineup_model.load_snapshot()
    yield

app = FastAPI(
    title="HoopIQ API",
    description="NBA analytics platform - 11 AI/ML features.",
    version="2.0.0",
    lifespan=lifespan,
)

# Rate limiting. `limiter` on app.state is how slowapi's decorators and its
# exception handler find the configured limiter; SlowAPIMiddleware is what
# applies the default limit to every route that doesn't set its own.
app.state.limiter = limiter
app.add_middleware(SlowAPIMiddleware)


@app.exception_handler(RateLimitExceeded)
def rate_limited(request: Request, exc: RateLimitExceeded):
    """429 in the same `detail` shape as every other error the API returns.

    Deliberately sync, not async: SlowAPIMiddleware checks limits from a
    synchronous path and silently swaps in its own handler if the registered
    one is a coroutine function, which would put the body back to `error`.

    slowapi's stock handler uses an `error` key, which the frontend's
    `request()` helper doesn't read -- users would just see "Request failed".
    The Retry-After / X-RateLimit-* headers are injected the same way the
    stock handler does it.
    """
    response = JSONResponse(
        status_code=429,
        content={"detail": f"Rate limit reached ({exc.detail}). Please wait a moment and try again."},
    )
    return request.app.state.limiter._inject_headers(response, request.state.view_rate_limit)


@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, exc: RequestValidationError):
    """Flatten FastAPI's 422 body into a `detail` string.

    The default shape is a list of error objects; the frontend reads
    `err.detail` and renders it directly, which would show "[object Object]"
    for every input that trips one of the new field limits. Only the field
    path and the rule are echoed -- never the offending value.
    """
    problems = []
    for err in exc.errors()[:5]:
        field = ".".join(str(p) for p in err["loc"] if p not in ("body", "query"))
        problems.append(f"{field or 'request'}: {err['msg']}")
    return JSONResponse(status_code=422, content={"detail": "; ".join(problems)})

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "X-Admin-Token"],
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
app.include_router(draft_simulator.router)
app.include_router(standings.router)
app.include_router(draft_comp.router)
app.include_router(rosters.router)
app.include_router(team_players.router)


@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "hoopiq-api",
        "version": "2.0.0",
        "features": 11,
    }
