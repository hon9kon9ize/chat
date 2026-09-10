from pathlib import Path
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    upstream_base_url: str
    upstream_api_key: str = "none"
    model_id: str
    max_tokens: int = 8192
    daily_limit: int = 50
    rate_limit_tz: str = "Asia/Hong_Kong"
    trust_forwarded_for: bool = False
    db_path: str = "./usage.db"
    agents_dir: Path = Path("./agents")

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
