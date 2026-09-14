from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.utils.season import get_current_nba_season


# Always allowed, independent of CORS_ORIGINS -- see Settings.cors_origin_list.
PRODUCTION_ORIGINS = ["https://hoopiq-nba.com", "https://www.hoopiq-nba.com"]


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
        """Allowed browser origins: the production site, always, plus CORS_ORIGINS.

        The site moved to a custom domain while CORS_ORIGINS on Render still
        listed the old address, so every browser request was refused and pages
        showed no players -- while the API looked perfectly healthy to anything
        that isn't a browser, since only browsers enforce CORS. Pinning the known
        domain here means a stale dashboard value can't take the site down;
        CORS_ORIGINS still adds to it (previews, staging).

        Trailing slashes are stripped: a browser's Origin never has one and the
        match is exact, so "https://site.com/" would otherwise match nothing.
        """
        configured = [o.strip().rstrip("/") for o in self.cors_origins.split(",") if o.strip()]
        return list(dict.fromkeys(PRODUCTION_ORIGINS + configured))


settings = Settings()
