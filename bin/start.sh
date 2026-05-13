#!/usr/bin/env bash
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
[ -f "$ROOT/conf/config.env" ] && source "$ROOT/conf/config.env"
cd "$ROOT/app"
uv sync --quiet
exec uv run uvicorn main:app \
    --host 0.0.0.0 \
    --port "${PORT:-8000}" \
    --workers 2 \
    --log-level info \
    >> "$ROOT/logs/app.log" 2>&1 &
echo $! > "$ROOT/logs/app.pid"
echo "cwrvis started (pid $!)"
