from fastapi import APIRouter, HTTPException
from database import get_db
from schemas import OkResponse
from config import VALID_REGION_IDS, KG_VARS

router = APIRouter()

VALID_GRANULARITIES = frozenset({"year", "month", "mean_all", "mean_month", "mean_season"})

SEASON_CASE = """
    CASE
        WHEN month IN (3,4,5)   THEN 'spring'
        WHEN month IN (6,7,8)   THEN 'summer'
        WHEN month IN (9,10,11) THEN 'autumn'
        ELSE                         'winter'
    END
""".strip()

SEASON_ORDER = {"spring": 0, "summer": 1, "autumn": 2, "winter": 3}


def _var_columns(conn) -> list[str]:
    """从 PRAGMA 动态读取 15 个 var 列名，不依赖硬编码。"""
    fixed = {"region_id", "granularity", "year", "month"}
    return [r["name"] for r in conn.execute("PRAGMA table_info(region_stats)") if r["name"] not in fixed]


def _avg_select(var_cols: list[str]) -> str:
    return ", ".join(f"AVG({v}) AS {v}" for v in var_cols)


def _season_step1_select(var_cols: list[str]) -> str:
    """CTE 第一步：kg 列用 SUM，非 kg 列用 AVG，得到每年每季节的聚合值。"""
    parts = []
    for v in var_cols:
        fn = "SUM" if v in KG_VARS else "AVG"
        parts.append(f"{fn}({v}) AS {v}")
    return ", ".join(parts)


def _row_to_dict(row, var_cols: list[str], time_keys: list[str]) -> dict:
    d = {k: row[k] for k in time_keys if row[k] is not None}
    for v in var_cols:
        d[v] = row[v]
    return d


@router.get("/stats", response_model=OkResponse)
def get_stats(
    region_id: str,
    granularity: str,
    year_start: int,
    year_end: int,
):
    if region_id not in VALID_REGION_IDS:
        raise HTTPException(404, f"未知区域：{region_id}")
    if granularity not in VALID_GRANULARITIES:
        raise HTTPException(400, f"granularity 必须为：{', '.join(sorted(VALID_GRANULARITIES))}")
    if not (2000 <= year_start <= 2025 and 2000 <= year_end <= 2025):
        raise HTTPException(400, "year_start / year_end 必须在 2000–2025 范围内")
    if year_end < year_start:
        raise HTTPException(400, "year_end 必须 >= year_start")

    with get_db() as conn:
        var_cols = _var_columns(conn)
        rows = _query(conn, granularity, region_id, year_start, year_end, var_cols)

    return OkResponse(data={
        "region_id":   region_id,
        "granularity": granularity,
        "rows":        rows,
    })


def _query(conn, granularity: str, region_id: str, year_start: int, year_end: int, var_cols: list[str]) -> list[dict]:
    params_base = [region_id, year_start, year_end]

    if granularity == "year":
        sql = f"""
            SELECT year, month, {', '.join(var_cols)}
            FROM region_stats
            WHERE region_id = ? AND granularity = 'year'
              AND year BETWEEN ? AND ?
            ORDER BY year
        """
        rows = conn.execute(sql, params_base).fetchall()
        return [_row_to_dict(r, var_cols, ["year"]) for r in rows]

    if granularity == "month":
        sql = f"""
            SELECT year, month, {', '.join(var_cols)}
            FROM region_stats
            WHERE region_id = ? AND granularity = 'month'
              AND year BETWEEN ? AND ?
            ORDER BY year, month
        """
        rows = conn.execute(sql, params_base).fetchall()
        return [_row_to_dict(r, var_cols, ["year", "month"]) for r in rows]

    if granularity == "mean_all":
        sql = f"""
            SELECT {_avg_select(var_cols)}
            FROM region_stats
            WHERE region_id = ? AND granularity = 'year'
              AND year BETWEEN ? AND ?
        """
        row = conn.execute(sql, params_base).fetchone()
        return [{v: row[v] for v in var_cols}]

    if granularity == "mean_month":
        sql = f"""
            SELECT month, {_avg_select(var_cols)}
            FROM region_stats
            WHERE region_id = ? AND granularity = 'month'
              AND year BETWEEN ? AND ?
            GROUP BY month
            ORDER BY month
        """
        rows = conn.execute(sql, params_base).fetchall()
        return [_row_to_dict(r, var_cols, ["month"]) for r in rows]

    # mean_season：两步聚合
    # 第一步（CTE）：月→季，kg 列 SUM，非 kg 列 AVG，每年每季节一行
    # 第二步（外层）：跨年取 AVG，GROUP BY season
    sql = f"""
        WITH season_per_year AS (
            SELECT
                year,
                {SEASON_CASE} AS season,
                {_season_step1_select(var_cols)}
            FROM region_stats
            WHERE region_id = ? AND granularity = 'month'
              AND year BETWEEN ? AND ?
            GROUP BY year, season
        )
        SELECT season, {_avg_select(var_cols)}
        FROM season_per_year
        GROUP BY season
    """
    rows = conn.execute(sql, params_base).fetchall()
    result = [_row_to_dict(r, var_cols, ["season"]) for r in rows]
    result.sort(key=lambda r: SEASON_ORDER.get(r.get("season", ""), 99))
    return result
