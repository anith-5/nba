from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.utils.season import get_current_nba_season


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    cors_origins: str = "http://localhost:5174,http://127.0.0.1:5174"
    api_host: str = "0.0.0.0"
    api_port: int = 8001
    anthropic_api_key: str = ""
    # Unlocks the two model-training endpoints. Empty (the default) keeps them
    # closed -- see app/security.py.
    admin_token: str = ""
    # Hard ceiling on Anthropic tokens per UTC day, across all callers. This is
    # what caps the bill: the per-IP limits don't stop someone rotating
    # addresses. 0 disables it. At Haiku rates 500k tokens is roughly $1-2/day
    # worst case; raise it once you know your real traffic.
    daily_token_budget: int = 500_000
    # Ceiling for ordinary cached/computed endpoints. The AI routes set their
    # own, much tighter, limits on top of this.
    rate_limit_default: str = "120/minute"
    rate_limit_enabled: bool = True
    # Computed fresh every process start rather than hardcoded -- see
    # app/utils/season.py. Still overridable via a CURRENT_SEASON env var
    # for local testing/pinning, same as every other setting here.
    current_season: str = Field(default_factory=get_current_nba_season)

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
