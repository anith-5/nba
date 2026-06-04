"""Lazy-initialized Anthropic client — degrades gracefully if key not set."""

from __future__ import annotations

import logging
from typing import Optional

logger = logging.getLogger(__name__)

_client = None
_init_attempted = False


def get_client():
    global _client, _init_attempted
    if _init_attempted:
        return _client
    _init_attempted = True

    from app.config import settings
    key = settings.anthropic_api_key
    if not key:
        logger.warning("ANTHROPIC_API_KEY not set — AI features disabled")
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

    response = client.messages.create(
        model=model,
        max_tokens=max_tokens,
        system=system,
        messages=messages,
    )
    text = response.content[0].text
    tokens = response.usage.input_tokens + response.usage.output_tokens
    return text, tokens
