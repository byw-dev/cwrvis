from fastapi import APIRouter, HTTPException, Query
from typing import Annotated
from database import get_db
from schemas import OkResponse

router = APIRouter()


@router.get("/stats", response_model=OkResponse)
def get_stats(
    region_id: str,
    granularity: str,
    year_start: int,
    year_end: int,
    var: Annotated[list[str], Query(min_length=1)],
):
    if granularity not in ("year", "month"):
        raise HTTPException(400, "granularity 必须为 'year' 或 'month'")
    if year_end < year_start:
        raise HTTPException(400, "year_end 必须 >= year_start")
    if not var:
        raise HTTPException(400, "至少指定一个 var")

    placeholders = ",".join("?" * len(var))
    sql = f"""
        SELECT year, month, var, value
        FROM region_stats
        WHERE region_id = ?
          AND granularity = ?
          AND year BETWEEN ? AND ?
          AND var IN ({placeholders})
        ORDER BY year, month, var
    """
    with get_db() as conn:
        rows = conn.execute(sql, [region_id, granularity, year_start, year_end, *var]).fetchall()

    result: dict[str, list] = {}
    for row in rows:
        result.setdefault(row["var"], []).append(
            {"year": row["year"], "month": row["month"], "value": row["value"]}
        )

    return OkResponse(data={"region_id": region_id, "granularity": granularity, "vars": result})
