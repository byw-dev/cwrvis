#!/usr/bin/env bash
# cwrvis 一键部署脚本
# 用法：sudo ./install.sh
# 适用：Linux x86_64（Ubuntu 22.04+ 推荐）
#
# 在线版（无 app/wheels/）：目标机须已安装 uv
# 离线版（含 app/wheels/）：目标机须已安装 python3.11，无需网络

set -euo pipefail

# ── 常量 ──────────────────────────────────────────────────────────────────────
PKG_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_USER="cwrvis"
INSTALL_BASE="/opt"
SVC_NAME="cwrvis"
SVC_FILE="/etc/systemd/system/${SVC_NAME}.service"

# ── root 检查 ─────────────────────────────────────────────────────────────────
if [[ $EUID -ne 0 ]]; then
    echo "[error] 此脚本须以 root 运行：sudo $0" >&2
    exit 1
fi

# ── 检测在线 / 离线模式 ───────────────────────────────────────────────────────
WHEELS_DIR="$PKG_DIR/app/wheels"
if [[ -d "$WHEELS_DIR" && -n "$(ls -A "$WHEELS_DIR" 2>/dev/null)" ]]; then
    MODE=offline
else
    MODE=online
fi
echo "[cwrvis] 部署模式：${MODE}"

# ── 前置检查 ──────────────────────────────────────────────────────────────────
if [[ "$MODE" == "online" ]]; then
    if ! command -v uv &>/dev/null; then
        echo "[error] 在线模式需要 uv，未找到。请先安装：" >&2
        echo "  curl -LsSf https://astral.sh/uv/install.sh | sh" >&2
        exit 1
    fi
    echo "[cwrvis] uv 版本：$(uv --version)"
else
    if ! command -v python3.11 &>/dev/null; then
        echo "[error] 离线模式需要 python3.11，未找到。请先安装：" >&2
        echo "  sudo apt install python3.11" >&2
        exit 1
    fi
    echo "[cwrvis] Python 版本：$(python3.11 --version)"
fi

# ── 读取版本号 ────────────────────────────────────────────────────────────────
BUILD_INFO="$PKG_DIR/app/build_info.json"
if command -v python3 &>/dev/null && [[ -f "$BUILD_INFO" ]]; then
    VERSION=$(python3 -c "import json; print(json.load(open('$BUILD_INFO'))['version_base'])")
else
    # 从目录名推断（cwrvis-1.0.0 或 cwrvis-1.0.0-offline）
    VERSION=$(basename "$PKG_DIR" | sed 's/^cwrvis-//; s/-offline$//')
fi
DEST="$INSTALL_BASE/${SVC_NAME}-${VERSION}"
LINK="$INSTALL_BASE/${SVC_NAME}"

echo "[cwrvis] 版本：${VERSION}"
echo "[cwrvis] 安装目录：${DEST}"

# ── 创建系统用户 ──────────────────────────────────────────────────────────────
if id "$APP_USER" &>/dev/null; then
    echo "[cwrvis] 系统用户已存在：${APP_USER}（跳过）"
else
    useradd --system --no-create-home --shell /usr/sbin/nologin "$APP_USER"
    echo "[cwrvis] 已创建系统用户：${APP_USER}"
fi

# ── 停止运行中的服务 ──────────────────────────────────────────────────────────
if systemctl is-active --quiet "$SVC_NAME" 2>/dev/null; then
    echo "[cwrvis] 停止运行中的服务..."
    systemctl stop "$SVC_NAME"
fi

# ── 安装文件 ──────────────────────────────────────────────────────────────────
echo "[cwrvis] 复制文件至 ${DEST}..."
rm -rf "$DEST"
cp -a "$PKG_DIR" "$DEST"

ln -sfn "$DEST" "$LINK"
echo "[cwrvis] 符号链接已更新：${LINK} → ${DEST}"

# ── 处理 config.env ───────────────────────────────────────────────────────────
CONFIG="$LINK/conf/config.env"
EXAMPLE="$LINK/conf/config.env.example"

if [[ ! -f "$CONFIG" ]]; then
    cp "$EXAMPLE" "$CONFIG"
    echo "[cwrvis] 已创建配置文件：${CONFIG}"
    echo "[cwrvis][提示] 请确认配置项，修改后运行：sudo systemctl restart ${SVC_NAME}"
else
    PKGNEW="${CONFIG}.pkgnew"
    cp "$EXAMPLE" "$PKGNEW"
    echo ""
    echo "[cwrvis][注意] 已有配置文件，新版模板已保存为："
    echo "  ${PKGNEW}"
    echo "  请与当前配置比对：diff ${CONFIG} ${PKGNEW}"
    echo ""
fi

# ── 建立 venv + 安装依赖 ──────────────────────────────────────────────────────
VENV="$LINK/app/.venv"
REQ="$LINK/app/requirements.txt"

echo "[cwrvis] 安装 Python 依赖（${MODE} 模式）..."
if [[ "$MODE" == "online" ]]; then
    uv venv "$VENV"
    uv pip install --python "$VENV/bin/python" -r "$REQ"
else
    python3.11 -m venv "$VENV"
    "$VENV/bin/pip" install --quiet \
        --no-index \
        --find-links "$LINK/app/wheels/" \
        -r "$REQ"
fi
echo "[cwrvis] 依赖安装完成"

# ── 设置目录权限 ──────────────────────────────────────────────────────────────
chown -R "$APP_USER:$APP_USER" "$DEST"
echo "[cwrvis] 目录权限已设置：${APP_USER}:${APP_USER}"

# ── 安装 systemd service ──────────────────────────────────────────────────────
SVC_SRC="$LINK/deploy/systemd/${SVC_NAME}.service"
cp "$SVC_SRC" "$SVC_FILE"
systemctl daemon-reload
systemctl enable --now "$SVC_NAME"
echo "[cwrvis] systemd service 已启用并启动"

# ── 完成 ──────────────────────────────────────────────────────────────────────
PORT=$(grep -E '^PORT=' "$CONFIG" 2>/dev/null | cut -d= -f2 || echo 8000)
IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "127.0.0.1")

echo ""
echo "========================================"
echo " cwrvis ${VERSION} 部署完成"
echo "========================================"
echo " 访问地址：http://${IP}:${PORT}"
echo " 查看日志：journalctl -u ${SVC_NAME} -f"
echo " 服务状态：systemctl status ${SVC_NAME}"
echo "========================================"
