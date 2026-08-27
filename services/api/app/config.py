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
    # Ceiling for ordinary cached/computed endpoints. The AI routes set their
    # own, much tighter, limits on top of this.
    rate_limit_default: str = "120/minute"
    rate_limit_enabled: bool = True
    # How many proxies sit in front of the app, for reading X-Forwarded-For.
    # 1 = Render alone. Raise it if you add another proxy (e.g. Cloudflare).
    trusted_proxy_hops: int = 1
    # Computed fresh every process start rather than hardcoded -- see
    # app/utils/season.py. Still overridable via a CURRENT_SEASON env var
    # for local testing/pinning, same as every other setting here.
    current_season: str = Field(default_factory=get_current_nba_season)

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
