# 部署与运维设计 — cwrvis

> 文档版本：v1.0  
> 对应模块：`deploy/`

---

## 服务器规格要求

| 项目 | 最低配置（演示） | 说明 |
|------|-----------------|------|
| CPU | 2 核 | 后端几乎无计算，Nginx 静态文件服务主导 |
| 内存 | 4 GB | 系统 + Nginx + FastAPI（2 worker） |
| 磁盘 | 50 GB SSD | 静态文件约 800MB，系统和日志留足余量 |
| 带宽 | 5 Mbps | 单用户加载一个 var 全年切片约 1.25MB，可接受 |
| 操作系统 | Linux（Ubuntu 22.04 推荐） | |

---

## 进程架构

```
Internet
    │
    ▼
 Nginx :80 / :443
    │
    ├── /                     → frontend/dist/（静态托管）
    ├── /static/              → /data/static/（静态文件托管）
    │     ├── grid/**/*.json  （格点数据）
    │     ├── reports/*.docx  （预生成报告）
    │     ├── meta/vars.json  （var 元数据）
    │     └── db/stats.db     （SQLite，只后端使用，不对外暴露）
    │
    └── /api/                 → 反向代理 → FastAPI :8000
```

> **注意**：`/data/static/db/` 目录不得通过 Nginx 对外暴露，仅后端进程读取。

---

## 目录结构（服务器）

```
/
├── srv/cwrvis/
│   ├── backend/             # FastAPI 应用代码
│   ├── frontend/dist/       # Vue 构建产物
│   └── deploy/              # 部署配置文件（nginx.conf、systemd units）
│
└── data/
    └── static/
        ├── grid/            # 格点 JSON 切片（约 800MB）
        ├── reports/         # 预生成 docx 报告
        ├── meta/
        │   └── vars.json    # var 元数据
        └── db/
            └── stats.db     # SQLite 区域统计数据库
```

`/data/` 与应用代码分离，便于数据更新时不影响代码部署。

---

## Nginx 配置（`deploy/nginx.conf`）

```nginx
server {
    listen 80;
    server_name your-domain.com;  # 替换为实际域名或 IP

    # 前端静态文件
    location / {
        root /srv/cwrvis/frontend/dist;
        index index.html;
        try_files $uri $uri/ /index.html;  # SPA 路由支持
        expires 1h;
        add_header Cache-Control "public, must-revalidate";
    }

    # 格点 JSON 静态文件（较大，缓存时间长）
    location /static/grid/ {
        alias /data/static/grid/;
        expires 7d;
        add_header Cache-Control "public, immutable";
        add_header Access-Control-Allow-Origin "*";
    }

    # 报告 docx 文件
    location /static/reports/ {
        alias /data/static/reports/;
        expires 1d;
        add_header Cache-Control "public";
    }

    # var 元数据
    location /static/meta/ {
        alias /data/static/meta/;
        expires 1h;
        add_header Cache-Control "public";
    }

    # 禁止直接访问数据库文件
    location /data/static/db/ {
        deny all;
    }

    # FastAPI 后端代理
    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 30s;
    }
}
```

若需要 HTTPS，在 Nginx 配置中启用 SSL，推荐使用 Let's Encrypt（certbot）。

---

## FastAPI 进程管理（systemd）

文件：`deploy/systemd/cwrvis-backend.service`

```ini
[Unit]
Description=cwrvis FastAPI Backend
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/srv/cwrvis/backend
Environment="PATH=/srv/cwrvis/venv/bin"
ExecStart=/srv/cwrvis/venv/bin/uvicorn main:app \
    --host 127.0.0.1 \
    --port 8000 \
    --workers 2 \
    --log-level info
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

启用与启动：
```bash
sudo systemctl enable cwrvis-backend
sudo systemctl start cwrvis-backend
sudo systemctl status cwrvis-backend
```

---

## 部署步骤

### 首次部署

```bash
# 1. 安装系统依赖
sudo apt update && sudo apt install -y python3.11 python3.11-venv nginx

# 2. 创建应用目录
sudo mkdir -p /srv/cwrvis /data/static/{grid,reports,meta,db}
sudo chown -R $USER:$USER /srv/cwrvis /data/static

# 3. 克隆代码
git clone <repo-url> /srv/cwrvis

# 4. 后端 Python 环境
cd /srv/cwrvis
python3.11 -m venv venv
source venv/bin/activate
pip install -r backend/requirements.txt

# 5. 前端构建
cd /srv/cwrvis/frontend
npm install
npm run build

# 6. 配置环境变量
cp backend/.env.example backend/.env
# 编辑 backend/.env，填写实际路径

# 7. 复制预生成静态数据（在数据机器上已生成）
# rsync -av /path/to/static/ user@server:/data/static/

# 8. 配置 Nginx
sudo cp deploy/nginx.conf /etc/nginx/sites-available/cwrvis
sudo ln -s /etc/nginx/sites-available/cwrvis /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# 9. 配置 systemd
sudo cp deploy/systemd/cwrvis-backend.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now cwrvis-backend
```

### 代码更新部署

```bash
cd /srv/cwrvis
git pull

# 更新后端依赖（如有变化）
source venv/bin/activate
pip install -r backend/requirements.txt

# 重新构建前端
cd frontend && npm install && npm run build

# 重启后端
sudo systemctl restart cwrvis-backend

# Nginx 无需重启（静态文件变化自动生效）
```

### 静态数据更新

```bash
# 在数据机器上重新运行预生成脚本
python scripts/netcdf_to_json.py ...
python scripts/netcdf_to_sqlite.py ...

# 同步到服务器
rsync -av --progress /path/to/static/grid/ user@server:/data/static/grid/
rsync -av /path/to/static/db/ user@server:/data/static/db/

# 后端无需重启（SQLite 每次请求重新读取）
# Nginx 缓存在 Cache-Control 过期后自动刷新
```

---

## 日志

后端日志：由 systemd journal 管理
```bash
journalctl -u cwrvis-backend -f
```

Nginx 日志：
```
/var/log/nginx/access.log
/var/log/nginx/error.log
```

---

## 健康检查

后端提供简单健康检查端点：
```
GET /api/v1/health
→ { "ok": true, "status": "healthy" }
```

可配置为 Nginx upstream health check 或监控系统探针。

---

## 资源使用预估（稳定运行）

| 资源 | 预估值 |
|------|--------|
| FastAPI 内存 | 2 worker × ~80MB = ~160MB |
| Nginx 内存 | ~30MB |
| 磁盘 IO | 低（静态文件有 OS 页面缓存） |
| CPU（空闲） | < 5% |
| CPU（活跃请求） | < 20%（主要是 Nginx 文件传输） |
