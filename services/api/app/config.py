from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.utils.season import get_current_nba_season


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    cors_origins: str = "http://localhost:5174,http://127.0.0.1:5174"
    api_host: str = "0.0.0.0"
    api_port: int = 8001
    anthropic_api_key: str = ""
    # Computed fresh every process start rather than hardcoded -- see
    # app/utils/season.py. Still overridable via a CURRENT_SEASON env var
    # for local testing/pinning, same as every other setting here.
    current_season: str = Field(default_factory=get_current_nba_season)

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
