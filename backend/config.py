from pathlib import Path
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    db_path: str = "../db/stats.db"
    static_root: str = "../static"
    report_dir: str = "../static/reports"
    grid_dir: str = "../static/grid"
    port: int = 8000
    dev_cors: bool = False  # 开发时设为 True 以允许 Vite 跨域

    model_config = {"env_file": "../conf/config.env", "env_file_encoding": "utf-8"}


settings = Settings()
