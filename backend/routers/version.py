import json
from pathlib import Path
from fastapi import APIRouter
from schemas import OkResponse

router = APIRouter()

_BUILD_INFO_PATH = Path(__file__).parent.parent / "build_info.json"

def _load() -> dict:
    if _BUILD_INFO_PATH.exists():
        return json.loads(_BUILD_INFO_PATH.read_text(encoding="utf-8"))
    return {
        "version": "dev",
        "version_base": "dev",
        "commit": "unknown",
        "commit_full": "unknown",
        "dirty": True,
        "branch": "unknown",
        "build_time": "unknown",
    }

_BUILD_INFO = _load()


@router.get("/version", response_model=OkResponse)
def get_version():
    return OkResponse(data=_BUILD_INFO)
