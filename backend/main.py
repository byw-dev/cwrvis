from pathlib import Path
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from config import settings
from routers import stats, report, meta

app = FastAPI(title="cwrvis", docs_url="/api/docs", redoc_url=None)

if settings.dev_cors:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173"],
        allow_methods=["GET"],
        allow_headers=["*"],
    )


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    return JSONResponse(status_code=500, content={"ok": False, "error": str(exc)})


@app.get("/health")
def health():
    return {"ok": True}


app.include_router(stats.router, prefix="/api/v1")
app.include_router(report.router, prefix="/api/v1")
app.include_router(meta.router, prefix="/api/v1")

# 静态文件挂载（/ 必须最后挂载）
_s = Path(settings.static_root)
if (_s / "grid").is_dir():
    app.mount("/grid",    StaticFiles(directory=_s / "grid"),           name="grid")
if (_s / "shapes").is_dir():
    app.mount("/shapes",  StaticFiles(directory=_s / "shapes"),         name="shapes")
if (_s / "reports").is_dir():
    app.mount("/reports", StaticFiles(directory=_s / "reports"),        name="reports")
if (_s / "web").is_dir():
    app.mount("/",        StaticFiles(directory=_s / "web", html=True), name="web")
