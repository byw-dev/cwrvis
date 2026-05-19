#!/usr/bin/env bash
# cwrvis 启动脚本
# systemd 托管时由 ExecStart 调用；也可手动运行（前台运行，Ctrl+C 停止）
# 前置：venv 须已由 install.sh 建立（app/.venv/）
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$ROOT/app"
VENV="$APP/.venv"

if [[ ! -x "$VENV/bin/python" ]]; then
    echo "[error] Python 虚拟环境不存在：${VENV}" >&2
    echo "  请先运行 install.sh 完成安装" >&2
    exit 1
fi

[ -f "$ROOT/conf/config.env" ] && source "$ROOT/conf/config.env"

cd "$APP"
exec "$VENV/bin/python" -m uvicorn main:app \
    --host 0.0.0.0 \
    --port "${PORT:-8000}" \
    --workers 2 \
    --log-level info
