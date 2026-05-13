from fastapi import APIRouter
from schemas import OkResponse
from config import REGION_MAP

router = APIRouter()


@router.get("/meta/regions", response_model=OkResponse)
def get_regions():
    return OkResponse(data=[
        {"region_id": rid, **info}
        for rid, info in REGION_MAP.items()
    ])


