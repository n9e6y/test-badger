from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    environment: str = "dev"
    database_url: str = "postgresql+asyncpg://shipcheck:shipcheck@localhost:5432/shipcheck"
    redis_url: str = "redis://localhost:6379/0"

    jwt_secret: str = "dev-only-insecure-secret-change-me-in-env-0000"
    jwt_expiry_days: int = 7
    cookie_name: str = "shipcheck_session"
    cookie_secure: bool = False
    fernet_key: str = ""

    artifacts_dir: str = "./artifacts"
    demo_shop_url: str = "http://localhost:8100"

    # LLM roles: "<provider>:<model>", provider in {anthropic, openai, openai_compat}
    llm_planner: str = "anthropic:claude-sonnet-5-5"
    llm_executor: str = "anthropic:claude-sonnet-5-5"
    llm_verifier: str = "anthropic:claude-sonnet-5-5"
    llm_reporter: str = "anthropic:claude-haiku-4-5"
    anthropic_api_key: str = ""
    openai_api_key: str = ""
    openai_compat_api_key: str = ""
    openai_compat_base_url: str = "https://openrouter.ai/api/v1"
    llm_price_overrides: str = "{}"

    # Browser
    browser_headless: bool = True
    browser_nav_timeout_ms: int = 30_000
    browser_action_timeout_ms: int = 5_000
    tester_user_agent_suffix: str = "ShipCheck/0.1 (pre-release QA agent)"

    # Budgets (03 §9)
    max_recon_pages: int = 6
    max_scenarios: int = 8
    max_steps_per_scenario: int = 25
    run_wall_clock_s: int = 720
    run_cost_cap_usd: float = 1.00
    runs_per_user_per_day: int = 10
    max_concurrent_runs: int = 2


@lru_cache
def get_settings() -> Settings:
    return Settings()
