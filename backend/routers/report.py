import re
from pathlib import Path
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from config import settings, REGION_MAP, VALID_REGION_IDS

router = APIRouter()

_DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
_YEAR_RE   = re.compile(r"^\d{4}$")

# 启动时扫描一次，结果常驻内存。报告文件不会在运行期变动，重启服务即可刷新。
def _scan_reports() -> dict:
    report_root = Path(settings.report_dir).resolve()
    result: dict[str, dict] = {}
    if not report_root.is_dir():
        return result
    for region_id, meta in REGION_MAP.items():
        region_dir = report_root / region_id
        if not region_dir.is_dir():
            continue
        years: list[int] = []
        has_multi = False
        for f in region_dir.iterdir():
            if f.suffix != ".docx":
                continue
            name = f.stem
            if name == f"Multi-Year_Evaluation_Report-{region_id}":
                has_multi = True
            elif m := re.match(rf"^(\d{{4}})-Year_Evaluation_Report-{re.escape(region_id)}$", name):
                years.append(int(m.group(1)))
        if years or has_multi:
            result[region_id] = {
                "name":      meta["name"],
                "level":     meta["level"],
                "years":     sorted(years),
                "has_multi": has_multi,
            }
    return result

_report_meta: dict = _scan_reports()


@router.get("/report/meta")
def get_report_meta():
    return {"ok": True, "data": _report_meta}


@router.get("/report/download")
def download_report(region_id: str, year: str):
    # 1. 枚举白名单校验
    if region_id not in VALID_REGION_IDS:
        raise HTTPException(400, f"非法 region_id：{region_id!r}")

    # 2. year 格式校验：仅允许 4 位数字或 "multi"
    if year != "multi" and not _YEAR_RE.match(year):
        raise HTTPException(400, f"非法 year 参数：{year!r}，须为 4 位年份或 'multi'")

    # 3. 确定性文件名拼接（无用户可控自由字符串参与路径构造）
    if year == "multi":
        filename = f"Multi-Year_Evaluation_Report-{region_id}.docx"
    else:
        filename = f"{year}-Year_Evaluation_Report-{region_id}.docx"

    report_root = Path(settings.report_dir).resolve()
    filepath    = (report_root / region_id / filename).resolve()

    # 4. 路径前缀断言（纵深防御）
    if not str(filepath).startswith(str(report_root)):
        raise HTTPException(400, "非法路径")

    if not filepath.is_file():
        raise HTTPException(404, f"报告文件不存在：{region_id}/{filename}")

    return FileResponse(
        path=filepath,
        media_type=_DOCX_MIME,
        filename=filename,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
