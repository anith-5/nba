"""Lazy-initialized Anthropic client - degrades gracefully if key not set."""

from __future__ import annotations

import logging
import threading
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)

_client = None
_init_attempted = False


class BudgetExceeded(ValueError):
    """The daily token budget is spent.

    Subclasses ValueError deliberately: every AI router already maps
    ValueError to a 503, so the ceiling degrades the same way a missing key
    does -- the feature reports itself unavailable instead of erroring.
    """


# Per-IP rate limits (app/limits.py) cap any single visitor. They do nothing
# about a caller who rotates addresses, which is why this exists: one global
# ceiling on what the key can spend per day, whoever is asking.
#
# In-process, matching the rate limiter -- the deploy is a single Render
# instance. Two workers would each get their own budget, so if this ever
# scales out, move the counter to the same shared store as the limits.
_budget_lock = threading.Lock()
_tokens_used = 0
_budget_day: Optional[str] = None


def _utc_day() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _check_budget() -> None:
    """Raise if today's budget is already spent. Call before spending."""
    from app.config import settings
    budget = settings.daily_token_budget
    if budget <= 0:          # 0 disables the ceiling
        return

    global _tokens_used, _budget_day
    with _budget_lock:
        today = _utc_day()
        if _budget_day != today:
            _tokens_used, _budget_day = 0, today
        if _tokens_used >= budget:
            logger.error(
                "Daily token budget exhausted: %d/%d used on %s", _tokens_used, budget, today
            )
            raise BudgetExceeded(
                "The daily AI usage limit for this site has been reached. "
                "It resets at midnight UTC."
            )


def _record_usage(tokens: int) -> None:
    """Add actual usage after a call returns.

    Counted after the fact, since the real total is only known from the
    response. One request can therefore overshoot the ceiling by its own
    size -- bounded by max_tokens, and the next call is refused.
    """
    from app.config import settings
    if settings.daily_token_budget <= 0:
        return

    global _tokens_used, _budget_day
    with _budget_lock:
        today = _utc_day()
        if _budget_day != today:
            _tokens_used, _budget_day = 0, today
        _tokens_used += max(0, tokens)
        used, budget = _tokens_used, settings.daily_token_budget

    if used >= budget:
        logger.error("Daily token budget now exhausted: %d/%d", used, budget)
    elif used >= budget * 0.8:
        logger.warning("Daily token budget at %.0f%%: %d/%d", used / budget * 100, used, budget)


def budget_status() -> dict:
    """Current spend, for operational visibility."""
    from app.config import settings
    with _budget_lock:
        return {
            "day": _budget_day or _utc_day(),
            "tokens_used": _tokens_used,
            "daily_budget": settings.daily_token_budget,
            "enabled": settings.daily_token_budget > 0,
        }


def get_client():
    global _client, _init_attempted
    if _init_attempted:
        return _client
    _init_attempted = True

    from app.config import settings
    key = settings.anthropic_api_key
    if not key:
        logger.warning("ANTHROPIC_API_KEY not set - AI features disabled")
        return None

    try:
        import anthropic
        _client = anthropic.Anthropic(api_key=key)
        logger.info("Anthropic client initialized")
        return _client
    except Exception as exc:
        logger.error("Failed to init Anthropic client: %s", exc)
        return None


def is_available() -> bool:
    return get_client() is not None


def chat_completion(
    model: str,
    system: str,
    messages: list[dict],
    max_tokens: int = 1024,
) -> tuple[str, int]:
    client = get_client()
    if client is None:
        raise ValueError("Anthropic client not available. Set ANTHROPIC_API_KEY in .env and restart.")

    _check_budget()

    response = client.messages.create(
        model=model,
        max_tokens=max_tokens,
        system=system,
        messages=messages,
    )
    text = response.content[0].text
    tokens = response.usage.input_tokens + response.usage.output_tokens
    _record_usage(tokens)
    return text, tokens
