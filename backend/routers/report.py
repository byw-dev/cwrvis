from pathlib import Path
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from config import settings

router = APIRouter()

_DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


@router.get("/report/download")
def download_report(region_id: str, granularity: str, start: str, end: str):
    filename = f"{region_id}_{granularity}_{start}_{end}.docx"
    report_root = Path(settings.report_dir).resolve()
    filepath = (report_root / filename).resolve()
    if not str(filepath).startswith(str(report_root)):
        raise HTTPException(400, "非法路径")
    if not filepath.is_file():
        raise HTTPException(404, f"报告文件不存在：{filename}")
    return FileResponse(path=filepath, media_type=_DOCX_MIME, filename=filename)
