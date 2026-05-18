#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$ROOT/app"
VENV="$APP/.venv"

# 加载环境变量
[ -f "$ROOT/conf/config.env" ] && source "$ROOT/conf/config.env"

# 首次启动：建 venv 并安装依赖（优先离线 wheels/，否则在线 fallback）
if [ ! -x "$VENV/bin/python" ]; then
    echo "[cwrvis] 初始化 Python 虚拟环境..."
    uv venv "$VENV"
    if [ -d "$APP/wheels" ] && [ -f "$APP/requirements.txt" ]; then
        echo "[cwrvis] 离线安装依赖（使用内嵌 wheel 缓存）..."
        uv pip install \
            --python "$VENV/bin/python" \
            --no-index \
            --find-links "$APP/wheels" \
            -r "$APP/requirements.txt"
    else
        echo "[cwrvis] 在线安装依赖（需要网络）..."
        uv pip install --python "$VENV/bin/python" "$APP"
    fi
    echo "[cwrvis] Python 环境就绪"
fi

mkdir -p "$ROOT/logs"
cd "$APP"

"$VENV/bin/python" -m uvicorn main:app \
    --host 0.0.0.0 \
    --port "${PORT:-8000}" \
    --workers 2 \
    --log-level info \
    >> "$ROOT/logs/app.log" 2>&1 &

echo $! > "$ROOT/logs/app.pid"
echo "cwrvis started  (pid=$(cat "$ROOT/logs/app.pid")  port=${PORT:-8000})"
