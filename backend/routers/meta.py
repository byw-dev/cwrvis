import json
from fastapi import APIRouter
from database import get_db
from schemas import OkResponse

router = APIRouter()


@router.get("/meta/regions", response_model=OkResponse)
def get_regions():
    with get_db() as conn:
        rows = conn.execute(
            "SELECT region_id, name, name_en, geojson FROM regions"
        ).fetchall()
    return OkResponse(data=[
        {
            "region_id": r["region_id"],
            "name": r["name"],
            "name_en": r["name_en"],
            "geojson": json.loads(r["geojson"]),
        }
        for r in rows
    ])


@router.get("/health")
def health():
    return {"ok": True}
