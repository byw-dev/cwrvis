#!/usr/bin/env bash
# cwrvis 手动停止脚本
# systemd 托管时请使用：sudo systemctl stop cwrvis
if command -v systemctl &>/dev/null && systemctl is-active --quiet cwrvis 2>/dev/null; then
    systemctl stop cwrvis
    echo "cwrvis stopped (via systemd)"
else
    pkill -f "uvicorn main:app" && echo "cwrvis stopped" || echo "cwrvis is not running"
fi
