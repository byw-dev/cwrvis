# 部署与运维设计 — cwrvis

> 文档版本：v2.0  
> 对应模块：`bin/`、`deploy/`

---

## 部署理念

**单进程、单压缩包**。FastAPI 同时承担 REST API 与静态文件服务，无需 Nginx。目标机只需安装 `uv`，解压分发包后执行 `bin/start.sh` 即可启动。

---

## 分发包结构

```
cwrvis-{version}/
├── bin/
│   ├── start.sh          # 启动服务
│   └── stop.sh           # 停止服务
├── app/                  # FastAPI 应用代码（来自仓库 backend/）
│   ├── main.py
│   ├── routers/
│   ├── pyproject.toml
│   └── ...
├── static/               # FastAPI StaticFiles 托管目录（对外可访问）
│   ├── grid/             # 格点 JSON + meta.json（预生成，约 33MB）
│   ├── reports/          # 预生成 .docx 报告
│   └── web/              # 前端 pnpm build 产物
├── db/                   # 仅 FastAPI 内部访问，不挂载为静态路由
│   └── stats.db
├── conf/
│   └── config.env        # 环境变量，start.sh 启动时加载
└── logs/                 # 运行日志（空目录占位）
```

---

## FastAPI 静态文件挂载策略

```python
# app/main.py（顺序不可颠倒，/ 须最后挂载）
app.mount("/grid",    StaticFiles(directory="../static/grid"),          name="grid")
app.mount("/reports", StaticFiles(directory="../static/reports"),       name="reports")
app.mount("/",        StaticFiles(directory="../static/web", html=True), name="web")

# db/ 不挂载，通过环境变量 DB_PATH 在代码中访问
```

路径约定：
- `/grid/meta.json`、`/grid/year/{var}.json`、`/grid/month/{var}.json`
- `/reports/{filename}.docx`
- `/api/v1/**`（REST API）

---

## 启动脚本

**`bin/start.sh`**：
```bash
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
```

**`bin/stop.sh`**：
```bash
#!/usr/bin/env bash
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PID_FILE="$ROOT/logs/app.pid"
if [ -f "$PID_FILE" ]; then
    kill "$(cat "$PID_FILE")" && rm "$PID_FILE"
    echo "cwrvis stopped"
else
    echo "no pid file found"
fi
```

---

## 环境变量（`conf/config.env`）

```bash
PORT=8000
DB_PATH=../db/stats.db
STATIC_ROOT=../static
REPORT_DIR=../static/reports
GRID_DIR=../static/grid
```

---

## 服务器规格要求

| 项目 | 最低配置（演示） | 说明 |
|------|-----------------|------|
| CPU | 2 核 | 后端几乎无计算，静态文件 I/O 主导 |
| 内存 | 2 GB | 系统 + uvicorn 2 worker（各 ~80MB） |
| 磁盘 | 20 GB SSD | 静态数据约 100MB，系统和日志留余量 |
| 带宽 | 5 Mbps | 单用户加载一个 var 月颗粒度切片约 2MB |
| 操作系统 | Linux（Ubuntu 22.04 推荐） | |

---

## 进程管理（systemd，可选）

文件：`deploy/systemd/cwrvis.service`

```ini
[Unit]
Description=cwrvis Web Service
After=network.target

[Service]
Type=forking
User=www-data
WorkingDirectory=/opt/cwrvis
ExecStart=/opt/cwrvis/bin/start.sh
ExecStop=/opt/cwrvis/bin/stop.sh
PIDFile=/opt/cwrvis/logs/app.pid
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

启用：
```bash
sudo cp deploy/systemd/cwrvis.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now cwrvis
```

---

## 部署步骤

### 首次部署

```bash
# 1. 目标机安装 uv（仅首次）
curl -LsSf https://astral.sh/uv/install.sh | sh

# 2. 上传并解压分发包
scp cwrvis-{version}.tar.gz user@server:/opt/
ssh user@server "cd /opt && tar xf cwrvis-{version}.tar.gz && mv cwrvis-{version} cwrvis"

# 3. 配置环境变量
cp /opt/cwrvis/conf/config.env.example /opt/cwrvis/conf/config.env
# 按需编辑 PORT 等配置

# 4. 上传预生成静态数据（在开发机/数据机上生成后同步）
rsync -av output/static/grid/   user@server:/opt/cwrvis/static/grid/
rsync -av output/static/db/     user@server:/opt/cwrvis/db/
# 将同事提供的 .docx 报告放入 /opt/cwrvis/static/reports/

# 5. 启动
/opt/cwrvis/bin/start.sh
```

### 应用代码更新

```bash
# 上传新版本包，解压后替换 app/ 目录
/opt/cwrvis/bin/stop.sh
rsync -av cwrvis-{new-version}/app/ user@server:/opt/cwrvis/app/
ssh user@server "/opt/cwrvis/bin/start.sh"
```

### 静态数据更新

```bash
# 在开发机重新运行预生成脚本（见 data-pipeline.md）
# 同步到服务器，无需重启服务
rsync -av output/static/grid/ user@server:/opt/cwrvis/static/grid/
rsync -av output/static/db/   user@server:/opt/cwrvis/db/
```

---

## 健康检查

```
GET /api/v1/health
→ { "ok": true }
```

---

## 日志

```bash
# 实时跟踪
tail -f /opt/cwrvis/logs/app.log

# systemd 方式
journalctl -u cwrvis -f
```
