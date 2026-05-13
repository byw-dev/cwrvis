from fastapi import APIRouter
from config import REGION_IDS, REGION_MAP
from schemas import OkResponse

router = APIRouter()


def _build_region_list():
    data = []
    for region_id in REGION_IDS:
        region = REGION_MAP.get(region_id, {})
        item = {
            "region_id": region_id,
            "name": region.get("name"),
            "level": region.get("level"),
        }
        if "name_en" in region:
            item["name_en"] = region.get("name_en")
        data.append(item)
    return data


@router.get("/meta/regions", response_model=OkResponse)
def get_regions():
    return OkResponse(data=_build_region_list())


@router.get("/health")
def health():
    return {"ok": True}
