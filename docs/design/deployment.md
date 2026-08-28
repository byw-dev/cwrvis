# 部署与运维设计 — cwrvis

> 文档版本：v3.0
> 对应模块：`bin/`、`deploy/`

---

## 部署理念

**单进程、单压缩包、一键安装**。FastAPI 同时承担 REST API 与静态文件服务，无需 Nginx。

分发包内置 `install.sh`，解压后运行一条命令完成用户创建、依赖安装、systemd 注册。提供**在线**和**离线**两种分发包（DEC-019）：

| 模式 | Makefile target | 产物 | 目标机前置要求 |
|------|----------------|------|--------------|
| 在线 | `make package` | `cwrvis-{version}.tar.gz` | `uv`（[安装方法](https://docs.astral.sh/uv/)） |
| 离线 | `make package-offline` | `cwrvis-{version}-offline.tar.gz` | `python3.11`（无需网络） |

`install.sh` 自动检测模式（通过 `app/wheels/` 目录是否存在），用户无需手动指定。

---

## 分发包结构

两种模式的包结构相同，离线版额外包含 `app/wheels/`：

```
cwrvis-{version}/
├── install.sh            # 一键部署脚本（解压后直接 sudo ./install.sh）
├── bin/
│   └── start.sh          # 启动脚本（由 systemd ExecStart 调用，也可手动运行）
├── app/                  # FastAPI 应用代码（来自仓库 backend/）
│   ├── main.py
│   ├── routers/
│   ├── pyproject.toml
│   ├── requirements.txt  # 锁定依赖清单
│   └── wheels/           # 【仅离线版】Linux x86_64 wheel 缓存
├── static/               # FastAPI StaticFiles 托管目录（对外可访问）
│   ├── grid/             # 格点 JSON + meta.json（预生成，约 33MB）
│   ├── shapes/           # 区域 GeoJSON（region_id 命名）
│   ├── reports/          # 预生成 .docx 报告
│   └── web/              # 前端 pnpm build 产物
├── db/                   # 仅 FastAPI 内部访问，不挂载为静态路由
│   └── stats.db
├── conf/
│   └── config.env.example  # 环境变量模板（install.sh 首次安装时复制为 config.env）
└── logs/                 # 空目录占位（日志主要由 journald 接管）
```

---

## 多变体共存部署

同一台主机可以并行部署多个变体（`master` 基线版 + 各 `custom/*` 定制版）。Makefile
从分支名 `custom/{variant}` 自动推导 `SVC_NAME` / `PKG_NAME`，因此各变体的安装目录、
systemd 单元、分发包名天然隔离：

```
/opt/cwrvis            -> /opt/cwrvis-{ver}            cwrvis.service
/opt/cwrvis-{variant}  -> /opt/cwrvis-{variant}-{ver}  cwrvis-{variant}.service
```

### 外部资产目录约定

体积大或需独立于发布包更新的资产放在 `/data/cwrvis/` 下，按变体加后缀区分：

```
/data/cwrvis/
├── db/              基线版的 stats.db
├── db-{variant}/    某定制版的 stats.db
├── reports/         基线版报告
├── reports-{variant}/
└── images-{variant}/  （若该变体启用专题图模块）
```

各变体的 `conf/config.env` 用绝对路径指向自己的那一份。

> ⚠️ **数据集不同的变体必须使用各自独立的 `DB_PATH`。** 若两个变体的区域集合或
> 格点范围不同，共用同一个 `stats.db` 会让其中一个读到完全错误的数据。反之，
> 数据集相同的变体（如基线版与仅做界面定制的版本）共用一份是合理的。

### 哪些配置项真正生效

| 配置项 | 是否生效 | 读取处 |
|--------|---------|--------|
| `DB_PATH` | ✅ | `database.py` |
| `STATIC_ROOT` | ✅ | `main.py`，据此挂载 `/grid`、`/shapes`、`/` |
| `REPORT_DIR` | ✅ | `routers/report.py` |
| `PORT` / `FORWARDED_ALLOW_IPS` | ✅ | `bin/start.sh` |
| `GRID_DIR` / `SHAPES_DIR` | ❌ **死配置** | 无任何代码读取 |

`GRID_DIR` 容易误导 —— 把它指向 `/data/cwrvis/grid` 不会改变 `/grid` 的服务来源，
格点 JSON 始终随发布包走 `STATIC_ROOT/grid`。要更换格点数据只能重新打包部署。

### 升级时的注意事项

`install.sh` 会暂存并还原 `conf/` 下的用户文件，因此 `config.env` 跨版本保留。
但**它不会碰 `/data/cwrvis/` 下的任何东西** —— 若本次升级同时更新了 `stats.db`，
必须手工把包内的 `db/stats.db` 复制到 `DB_PATH` 指向的位置，否则新包配旧库。

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

## install.sh 行为

`install.sh` 须以 root 权限运行（`sudo ./install.sh`），执行以下步骤：

1. **检测模式**：`app/wheels/` 存在 → 离线模式；否则 → 在线模式
2. **前置检查**：
   - 在线模式：检查 `uv` 是否可用，不可用则报错退出并提示安装命令
   - 离线模式：检查 `python3.11` 是否可用，不可用则报错退出并提示 `apt install python3.11`
3. **创建系统用户** `cwrvis`（若已存在则跳过）：无家目录、禁止登录 shell
4. **安装文件**：将分发包内容复制至 `/opt/cwrvis-{version}/`，创建符号链接 `/opt/cwrvis` → `/opt/cwrvis-{version}/`；升级时先暂存旧 `conf/` 下所有非 `.example` 文件，复制完成后回写，防止用户文件被覆盖
5. **处理 `config.env`**：
   - 首次安装（`/opt/cwrvis/conf/config.env` 不存在）：将 `config.env.example` 复制为 `config.env`
   - 升级安装（已有 `config.env`）：将新版 example 保存为 `config.env.pkgnew`，提示管理员比对差异
6. **建立 venv + 安装依赖**：
   - 在线模式：`uv venv app/.venv && uv pip install -r app/requirements.txt`
   - 离线模式：`python3.11 -m venv app/.venv && app/.venv/bin/pip install --no-index --find-links app/wheels/ -r app/requirements.txt`
7. **设置目录权限**：`chown -R cwrvis:cwrvis /opt/cwrvis-{version}/`
8. **安装 systemd service**：复制 `deploy/systemd/cwrvis.service` 到 `/etc/systemd/system/`，`daemon-reload`，`enable --now`

---

## 启动脚本

**`bin/start.sh`**（venv 已由 install.sh 建立，此脚本只负责启动）：

```bash
#!/usr/bin/env bash
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$ROOT/app"
VENV="$APP/.venv"

[ -f "$ROOT/conf/config.env" ] && source "$ROOT/conf/config.env"

cd "$APP"
exec "$VENV/bin/python" -m uvicorn main:app \
    --host 0.0.0.0 \
    --port "${PORT:-8000}" \
    --workers 2 \
    --log-level info \
    --forwarded-allow-ips "${FORWARDED_ALLOW_IPS:-127.0.0.1}"
```

> `exec` 使 uvicorn 替换 shell 进程，systemd 直接追踪 uvicorn PID，无需 PID 文件。

---

## 环境变量（`conf/config.env`）

```bash
PORT=8000
DB_PATH=../db/stats.db
STATIC_ROOT=../static
REPORT_DIR=../static/reports
GRID_DIR=../static/grid

# 反向代理场景：信任的上游 IP，见"反向代理真实 IP 透传"节
FORWARDED_ALLOW_IPS=
```

---

## systemd service

文件：`deploy/systemd/cwrvis.service`

```ini
[Unit]
Description=cwrvis Web Service
After=network.target

[Service]
Type=simple
User=cwrvis
WorkingDirectory=/opt/cwrvis
ExecStart=/opt/cwrvis/bin/start.sh
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

常用命令：

```bash
sudo systemctl status  cwrvis
sudo systemctl restart cwrvis
sudo systemctl stop    cwrvis
journalctl -u cwrvis -f        # 实时日志
journalctl -u cwrvis --since "1 hour ago"
```

---

## 服务器规格要求

| 项目 | 最低配置（演示） | 说明 |
|------|-----------------|------|
| CPU | 2 核 | 后端几乎无计算，静态文件 I/O 主导 |
| 内存 | 2 GB | 系统 + uvicorn 2 worker（各 ~80MB） |
| 磁盘 | 20 GB SSD | 静态数据约 100MB，系统和日志留余量 |
| 带宽 | 5 Mbps | 单用户加载一个 var 月颗粒度切片约 2MB |
| 操作系统 | Linux x86_64（Ubuntu 22.04 推荐） | |

**离线版额外要求**：目标机须有 `python3.11`。Ubuntu 22.04 默认 Python 3.10，需手动安装：

```bash
sudo apt install python3.11
```

**在线版额外要求**：目标机须有 `uv`：

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

---

## 部署步骤

### 首次部署

```bash
# 1. 构建机打包（make package 不自动编译前端，须先手动执行）
make frontend
make package VERSION=1.0.0          # 在线版
make package-offline VERSION=1.0.0  # 离线版

# 2. 上传至目标机
scp dist/cwrvis-1.0.0.tar.gz user@server:~

# 3. 解压并运行安装脚本（install.sh 自动完成所有配置）
ssh user@server
tar xf cwrvis-1.0.0.tar.gz
sudo cwrvis-1.0.0/install.sh

# 4. 按提示检查并按需修改配置
sudo vim /opt/cwrvis/conf/config.env

# 5. 若修改了配置，重启服务
sudo systemctl restart cwrvis

# 6. 验证
curl http://localhost:8000/api/v1/health
```

### 升级部署

```bash
# 1. 构建新版本包并上传（同样须先编译前端）
make frontend
make package VERSION=1.1.0
scp dist/cwrvis-1.1.0.tar.gz user@server:/tmp/

# 2. 解压并运行安装脚本（自动停服、替换、重启）
ssh user@server
tar xf cwrvis-1.1.0.tar.gz
sudo cwrvis-1.1.0/install.sh

# 3. 若升级包含新配置项，install.sh 会生成 config.env.pkgnew，手动比对
diff /opt/cwrvis/conf/config.env /opt/cwrvis/conf/config.env.pkgnew
```

### 静态数据更新（无需重启）

```bash
# 在开发机重新运行预生成脚本后，同步至服务器
rsync -av static/grid/    user@server:/opt/cwrvis/static/grid/
rsync -av static/reports/ user@server:/opt/cwrvis/static/reports/
rsync -av db/stats.db     user@server:/opt/cwrvis/db/
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
journalctl -u cwrvis -f                      # 实时跟踪
journalctl -u cwrvis --since "1 hour ago"    # 最近一小时
journalctl -u cwrvis --since today           # 今天
```

---

## 网络配置

### 方案 A：直接暴露端口（内网演示 / 临时）

直接开放 8000 端口，无需额外组件：

```bash
sudo ufw allow 8000/tcp
sudo ufw reload
```

访问地址：`http://<server-ip>:8000`

**适用场景**：内网环境、甲方验收演示（无 HTTPS 要求）。

---

### 方案 B：Nginx 反向代理 + HTTPS（推荐生产环境）

FastAPI 监听本地 8000，Nginx 负责 HTTPS 终止和端口转发：

```nginx
# /etc/nginx/sites-available/cwrvis
server {
    listen 80;
    server_name example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name example.com;

    ssl_certificate     /etc/letsencrypt/live/example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;

    client_max_body_size 10m;

    location / {
        proxy_pass         http://127.0.0.1:8000;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/cwrvis /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d example.com
```

> 使用 Nginx 后防火墙只开放 80/443，关闭 8000 对外访问。

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw deny 8000/tcp
sudo ufw reload
```

---

### 防火墙端口汇总

| 端口 | 用途 | 方案 A | 方案 B |
|------|------|--------|--------|
| 22 | SSH | 开放 | 开放 |
| 80 | HTTP（重定向） | 可选 | 开放 |
| 443 | HTTPS | — | 开放 |
| 8000 | FastAPI（直接访问） | 开放 | **关闭** |

---

## 反向代理真实 IP 透传

当 cwrvis 位于反向代理（Nginx）后端时，uvicorn access log 默认只能看到代理机器的 IP。需要同时配置 **Nginx 端**和 **cwrvis 端**，才能让日志记录真实客户端 IP。

### Nginx 端（已有 `proxy_set_header` 时无需修改）

在 `location /` 块中确保存在：

```nginx
proxy_set_header   X-Real-IP        $remote_addr;
proxy_set_header   X-Forwarded-For  $proxy_add_x_forwarded_for;
```

方案 B 的配置模板已包含这两行。

### cwrvis 端

在 `conf/config.env` 中填写 Nginx 机器的 LAN IP：

```bash
# 单台代理
FORWARDED_ALLOW_IPS=192.168.1.10

# 多台代理，逗号分隔
FORWARDED_ALLOW_IPS=192.168.1.10,192.168.1.11

# 封闭内网，信任所有上游（谨慎使用）
FORWARDED_ALLOW_IPS=*
```

`start.sh` 将此值传给 uvicorn 的 `--forwarded-allow-ips` 参数。uvicorn 内置 `ProxyHeadersMiddleware`，收到来自受信任上游的请求时，会自动将 `request.client.host` 改写为 `X-Forwarded-For` 中的真实 IP，access log 随之正确。

**未配置时的默认行为**：`FORWARDED_ALLOW_IPS` 为空时，`start.sh` 回退到 `127.0.0.1`——只有本机发起的请求才会被解析代理头，适用于直连场景，不影响非代理部署。

---

## 常见问题

**启动后无法访问**
1. 检查服务状态：`sudo systemctl status cwrvis`
2. 检查端口：`ss -tlnp | grep 8000`
3. 检查防火墙：`sudo ufw status`
4. 检查日志：`journalctl -u cwrvis -n 50`

**依赖安装失败（离线模式）**
- 确认 `app/wheels/` 目录非空：`ls /opt/cwrvis/app/wheels/ | wc -l`（应有数十个文件）
- 若 wheels 不完整，在有网络的机器重新 `make package-offline` 后重新安装

**重启后服务未自动启动**
- 确认 systemd 已启用：`sudo systemctl is-enabled cwrvis`
- 若未启用：`sudo systemctl enable cwrvis`
