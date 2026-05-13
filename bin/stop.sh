#!/usr/bin/env bash
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PID_FILE="$ROOT/logs/app.pid"
if [ -f "$PID_FILE" ]; then
    kill "$(cat "$PID_FILE")" && rm "$PID_FILE"
    echo "cwrvis stopped"
else
    echo "no pid file found"
fi
