from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    db_path: str = "../db/stats.db"
    static_root: str = "../static"
    report_dir: str = "../static/reports"
    grid_dir: str = "../static/grid"
    shapes_dir: str = "../static/shapes"
    port: int = 8000
    dev_cors: bool = False  # 开发时设为 True 以允许 Vite dev server 跨域

    model_config = {"env_file": "../conf/config.env", "env_file_encoding": "utf-8"}


settings = Settings()

# 区域元数据（硬编码，与 data/shapes/ 和 static/shapes/ 保持一致）
REGION_MAP: dict[str, dict[str, str]] = {
    "xizang":  {"name": "西藏自治区", "level": "province"},
    "lasa":    {"name": "拉萨市",     "level": "prefecture"},
    "rikaze":  {"name": "日喀则市",   "level": "prefecture"},
    "shannan": {"name": "山南市",     "level": "prefecture"},
    "linzhi":  {"name": "林芝市",     "level": "prefecture"},
    "changdu": {"name": "昌都市",     "level": "prefecture"},
    "naqu":    {"name": "那曲市",     "level": "prefecture"},
    "ali":     {"name": "阿里地区",   "level": "prefecture"},
}

VALID_REGION_IDS = frozenset(REGION_MAP)

# 单位为 kg 的变量（与 scripts/netcdf_to_sqlite.py 保持一致）
# mean_season 聚合时这些列在月→季步骤用 SUM，其余列用 AVG
KG_VARS: frozenset[str] = frozenset({
    "SP", "aveMv", "aveMh", "INv", "OTv",
    "INh", "OTh", "MC", "GMh", "GMv", "CWR",
})
