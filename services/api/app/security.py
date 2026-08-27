"""Admin gating and error-detail hygiene."""

from __future__ import annotations

import logging
import secrets

from fastapi import Header, HTTPException

from app.config import settings

logger = logging.getLogger(__name__)


def require_admin(x_admin_token: str = Header(default="")) -> None:
    """Gate for the two model-training endpoints.

    Training is a minutes-long NBA pull plus a fit on a 512MB instance -- an
    open trigger for it is a denial-of-service button. With no ADMIN_TOKEN
    configured the endpoints are closed rather than open: the hosted site
    serves pre-trained snapshots and never needs to train, and a deploy that
    forgot to set the variable should fail shut.
    """
    expected = settings.admin_token
    if not expected:
        raise HTTPException(
            status_code=503,
            detail="Training endpoints are disabled. Set ADMIN_TOKEN to enable them.",
        )
    # Constant-time so the check can't be turned into a character-by-character
    # oracle by timing repeated guesses.
    if not secrets.compare_digest(x_admin_token, expected):
        raise HTTPException(status_code=403, detail="Invalid or missing admin token.")


def internal_error(exc: Exception, context: str) -> HTTPException:
    """Log the real exception, hand the caller a generic 500.

    `HTTPException(500, str(e))` leaks file paths, SQL, API-key fragments and
    upstream error bodies to anyone who can trigger the failure. The detail
    belongs in the server log, not the response.
    """
    logger.exception("%s failed", context)
    return HTTPException(status_code=500, detail=f"{context} failed. Please try again later.")
