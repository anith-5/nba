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
    """The caller's IP, as seen from behind Render's proxy.

    Take the LEFTMOST X-Forwarded-For entry. This is the opposite of the
    usual advice, and the reason is specific to how this is hosted: Render
    appends its own edge address to the chain, so the rightmost entry is the
    SAME value for every request that reaches us. Keying on it silently made
    the limit global rather than per-client -- one busy caller (the arena
    server's roster preload, in practice) exhausted the pool for every
    visitor at once. Render documents the first entry as the originating
    client, so that is the only per-client signal available here.

    The tradeoff is that the leftmost entry is caller-supplied and therefore
    forgeable: someone can rotate the header to get a fresh bucket. That is
    inherent to IP-based limiting behind a proxy and is why these limits are
    only one layer -- the global daily token ceiling in claude_client.py is
    what actually bounds spend against a caller who does this.
    """
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        first = forwarded.split(",")[0].strip()
        if first:
            return first
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
