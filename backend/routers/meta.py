from fastapi import APIRouter
from schemas import OkResponse
from config import REGION_MAP
from database import get_db

router = APIRouter()


def _load_areas() -> dict[str, float]:
    """从 region_areas 表读取各区域面积，若表不存在或查询失败则返回空字典。"""
    try:
        with get_db() as conn:
            rows = conn.execute("SELECT region_id, area_m2 FROM region_areas").fetchall()
            return {r["region_id"]: r["area_m2"] for r in rows}
    except Exception:
        return {}


@router.get("/meta/regions", response_model=OkResponse)
def get_regions():
    areas = _load_areas()
    return OkResponse(data=[
        {"region_id": rid, **info, "area_m2": areas.get(rid)}
        for rid, info in REGION_MAP.items()
    ])


