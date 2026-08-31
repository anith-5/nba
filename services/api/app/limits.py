"""Rate limiting: the limiter, the client-identity function, and the limit strings.

Storage is in-process on purpose. The deploy is a single Render instance
(see render.yaml), so a shared store would add an external dependency without
changing behaviour. If this ever runs on more than one worker, pass a Redis
`storage_uri` to the Limiter below -- every limit string here stays as-is.
"""

from __future__ import annotations

from fastapi import Request
from slowapi import Limiter

from app.config import settings


def client_ip(request: Request) -> str:
    """The caller's real IP, as seen from behind Render's proxy.

    `request.client.host` is the *proxy's* address in production, which would
    collapse every visitor into one bucket and rate-limit the whole site as a
    single client. X-Forwarded-For carries the chain instead.

    We count from the RIGHT, not the left. Each proxy appends the address it
    saw, so the rightmost entry is the one Render itself added and is the only
    part of the header a caller cannot forge -- reading the leftmost entry
    would let anyone reset their own limit by sending a made-up header.
    `trusted_proxy_hops` says how many proxies sit in front of us (1 = Render
    alone; bump it to 2 if you later put Cloudflare in front).
    """
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        hops = [h.strip() for h in forwarded.split(",") if h.strip()]
        depth = max(1, settings.trusted_proxy_hops)
        if len(hops) >= depth:
            return hops[-depth]
        if hops:
            return hops[0]
    return request.client.host if request.client else "unknown"


limiter = Limiter(
    key_func=client_ip,
    default_limits=[settings.rate_limit_default],
    enabled=settings.rate_limit_enabled,
    headers_enabled=True,
)

# Endpoints that spend money on the Anthropic key. The burst limit keeps a
# stuck retry loop cheap; the daily limit is what actually caps one visitor's
# spend. Both are per-IP -- the global token budget (Tier 2) is what covers a
# caller who rotates addresses.
AI_LIMIT = "5/minute;50/day"

# Draft Simulator's /simulate sends a whole board of prospects per call and
# asks for 3000 output tokens, so it is several times the cost of one chat
# turn. Same daily ceiling, tighter burst.
AI_HEAVY_LIMIT = "3/minute;30/day"

# Model training pulls the NBA API for minutes and fits on a 512MB instance.
# Admin-gated as well (see app.security), so this is the second lock, not the
# only one.
TRAIN_LIMIT = "2/hour"
