# CLAUDE.md — cwrvis 项目 Agent 工作指南

本文件是 AI Agent 参与 cwrvis 项目开发的核心参考文档，保持精简以降低上下文负担。详细技术规格见 `docs/design/` 下的各设计文档；任务管理规范见 `docs/tasks/`。

---

## 项目概述

**项目名称**：cwrvis
**定位**：气候/水资源格点数据可视化与区域统计分析系统，B/S 架构
**当前阶段**：第一阶段 — 最小化可用版本（MVP），目标是快速实现可演示、满足验收要求的系统

### 核心功能

1. WebGIS 地图界面，加载格点数据并可视化为半透明叠加层（支持插值、色卡着色、阈值过滤）
2. 时间轴控制（年/月两种颗粒度），支持播放/暂停/逐帧切换，预加载优化体验
3. 预设区域点击查询，展示区域统计时间序列图表
4. 预生成报告文件（`.docx`）按命名规则下载

---

## 仓库结构

```
cwrvis/
├── CLAUDE.md                  # 本文件，Agent 工作主指南
├── AGENT.md                   # 指向本文件的入口
├── README.md                  # 项目简介（面向人类开发者）
├── TASK_LIST.md               # 任务进度仪表盘（快照、验收标准、待确认事项）
├── DECISIONS.md               # 技术决策记录（DEC-001 起编）
├── Makefile                   # 全流程构建脚本（data / frontend / package / dev）
│
├── docs/
│   ├── design/                # 各模块详细技术规格（Agent 按需阅读）
│   │   ├── overview.md        # 系统总体设计
│   │   ├── data-pipeline.md   # 数据预生成流程、格点 JSON 格式、SQLite schema
│   │   ├── backend.md         # 后端 API 接口详细规格
│   │   ├── frontend.md        # 前端架构、渲染方案、CSS 规范
│   │   └── deployment.md      # 部署与运维
│   ├── research/              # 调研与外部参考资料（算法逆向、竞品分析等）
│   └── tasks/                 # 任务与 BUG 管理
│       ├── SCHEMA.md          # 任务/BUG 条目格式规范
│       ├── BUG-WORKFLOW.md    # BUG 三阶段处理流程（报告→修复→关闭）
│       ├── FEATURE-WORKFLOW.md # Feature / Enhancement / Tweak 分类与处理流程
│       ├── active.md          # 当前进行中的任务（≤5 项）
│       ├── backlog.md         # 未规划需求 + 待外部确认事项
│       ├── phases/
│       │   └── phase-1-mvp.md # 第一阶段完整任务清单（含验收标准）
│       └── bugs/
│           ├── open.md        # 已知未修复的 Bug
│           └── closed.md      # 已修复的 Bug（含根因/方案/技术决策）
│
├── data/
│   ├── nc/                    # netcdf 原始数据（gitignored，由甲方提供）
│   ├── docx/                  # 预生成报告文档（gitignored，由甲方提供；make data-reports 复制至 static/reports/）
│   ├── colorbars/             # 各变量色卡量程统计 CSV（在 git 中；make colorbars 生成 frontend/src/config/colorbars.ts）
│   │   └── {region_id}/       # 每区域一子目录，如 lasa/、xizang/ 等
│   │       ├── {YYYY}-Year_Evaluation_Report-{region_id}.docx
│   │       └── Multi-Year_Evaluation_Report-{region_id}.docx
│   └── shapes/                # 预设区域边界 GeoJSON（GCJ-02，高德来源，在 git 中）
│
├── scripts/                   # 离线数据预生成脚本（Python，uv run）
│   ├── netcdf_to_json.py      # netcdf → 格点 JSON，输出至 static/grid/
│   ├── netcdf_to_sqlite.py    # netcdf × shape → SQLite，输出至 db/stats.db
│   └── csv_to_sqlite.py       # 预计算 CSV → SQLite，输出至 db/stats.db
│
├── backend/                   # FastAPI 后端（打包时映射为 app/）
│   ├── main.py                # 入口：挂载路由 + StaticFiles
│   ├── routers/               # stats / report / meta / version
│   ├── config.py              # 配置 + REGION_MAP + KG_VARS
│   ├── database.py
│   ├── schemas.py
│   └── pyproject.toml         # 依赖声明（uv 管理）
│
├── frontend/                  # Vue 3 前端
│   ├── src/
│   │   ├── components/
│   │   ├── workers/           # Web Worker（格点渲染）
│   │   ├── composables/
│   │   ├── stores/
│   │   └── config/            # 色卡、var 元数据等固化配置
│   ├── vite.config.ts         # build.outDir: '../static/web'
│   └── package.json
│
├── static/                    # 【gitignored】所有生成的静态资产
│   ├── grid/                  # 格点 JSON（76 文件）
│   ├── shapes/                # region_id 命名的 GeoJSON
│   ├── reports/               # .docx 报告（由 make data-reports 从 data/docx/ 复制，保留子目录结构）
│   └── web/                   # 前端 build 产物
│
├── db/                        # 【gitignored】生成的数据库
│   └── stats.db               # 区域统计 SQLite
│
├── conf/
│   └── config.env             # 环境变量（PORT、DB_PATH 等）
│
└── deploy/
    └── systemd/
        └── cwrvis.service     # systemd 服务单元文件
```

**dev 与部署结构同构**：后端从 `backend/` 目录运行，通过 `../static` 和 `../db` 访问生成产物；部署时只需将 `backend/` 重命名为 `app/`，其余目录结构不变。

---

## 技术栈

| 层级 | 技术选型 |
|------|----------|
| 后端框架 | Python 3.11+，FastAPI，uvicorn |
| 数据库 | SQLite（区域统计），无 ORM，直接 sqlite3 |
| 前端框架 | Vue 3 + Vite |
| 地图库 | MapLibre GL JS |
| 地图底图 | 高德地图栅格瓦片（GCJ-02 坐标系） |
| 图表库 | ECharts |
| 格点渲染 | Web Worker + OffscreenCanvas |
| 数据预生成 | Python，xarray，geopandas，numpy |

---

## 坐标系约定

**这是本项目最重要的工程约定，所有涉及坐标的代码必须遵守。**

- **netcdf 格点数据**：WGS-84
- **高德底图**：GCJ-02（火星坐标）
- **从高德开放平台下载的区域 GeoJSON**：GCJ-02，直接可用，无需转换
- **甲方未来提供的 shape 文件**：需确认坐标系，若为 WGS-84 需转换为 GCJ-02 再使用

**格点渲染的偏移处理策略**：1 度网格的视觉误差远大于 GCJ-02 偏移量（~500m），因此格点 Canvas 渲染按 WGS-84 正常计算，只在 ImageOverlay 绑定地图坐标时整体做边界框修正，不做逐点转换。

---

## 开发工作流约定

### 分支策略

```
main          生产可用代码
dev           集成分支
feature/*     功能开发
fix/BUG-XX    BUG 修复（本地临时分支，不推送远端，见 docs/tasks/BUG-WORKFLOW.md）
```

### Python 环境管理（强制约束）

**禁止直接使用 `python3` / `pip` 命令操作系统 Python 环境。** 所有 Python 依赖安装和脚本执行必须通过 `uv` 管理。

项目有**两套独立的 Python 环境**，各有自己的 `pyproject.toml` 和 `.venv`：

| 环境 | 位置 | 用途 | 依赖 |
|------|------|------|------|
| 后端运行时 | `backend/` | FastAPI / uvicorn 服务 | `backend/pyproject.toml` |
| 数据处理脚本 | `scripts/` | 离线预生成数据 | `scripts/pyproject.toml` |

```bash
# 首次 clone 后，一键初始化所有环境（推荐）
make setup

# 执行数据处理脚本（通过 Makefile，自动使用 scripts/.venv）
make data-grid
make data-sqlite-csv

# 直接调用（需从项目根运行）
uv run --project scripts python scripts/netcdf_to_json.py
uv run --project scripts python scripts/csv_to_sqlite.py --csv-dir data/csv --db-path db/stats.db

# 启动后端开发服务器（使用 backend/.venv）
cd backend && uv run uvicorn main:app --reload --port 8000
```

违反此约定会污染系统 Python 环境，Agent 不得以任何理由跳过。

---

### 前端环境管理（强制约束）

**Node.js 版本**：`v24.15.0`（Krypton），由项目根 `.nvmrc` 固化，通过 nvm 切换：
```bash
nvm use   # 自动读取 .nvmrc
```

**pnpm**：通过 corepack 管理，版本号固化于 `frontend/package.json` 的 `packageManager` 字段：
```bash
corepack enable   # 首次启用（一次性）
pnpm install      # corepack 自动使用 package.json 中声明的版本
```

**禁止**在前端目录使用 `npm` 命令，**禁止**使用全局安装的 pnpm 绕过 corepack。

---

### Agent 工作规范

1. **每次会话开始**，必须阅读本文件（`CLAUDE.md`）和本次任务对应的 `docs/design/` 子文档
2. **执行任何 Python 脚本或安装依赖前**，必须使用 `uv`，严禁直接调用 `python3` / `pip`（见上方"Python 环境管理"）
3. **修改涉及坐标处理的代码前**，必须重新确认本文件"坐标系约定"章节
4. **新增 API 接口前**，检查 `docs/design/backend.md` 是否已覆盖，避免重复定义
5. **修改数据文件命名规则或格式前**，必须同步更新相关设计文档与前后端代码中的所有引用
6. **不得**在前端直接发起对 netcdf 文件的请求，所有格点数据通过预生成 JSON 静态文件获取
7. **不得**在运行时执行 xarray/numpy 计算，所有计算在离线脚本阶段完成
8. **收到任何用户请求时**，必须先分类再执行：
   - **Bug**（原本正常、现在不符合设计）→ `docs/tasks/BUG-WORKFLOW.md`
   - **Tweak**（改颜色/文案/间距等微调，< 半天）→ 直接在 `dev` 实现
   - **Enhancement**（改进已有功能，架构不变）→ `enhance/` 分支
   - **Feature**（新增此前不存在的功能）→ `feature/` 本地分支
   - 执行前须**向用户说明分类及理由**（一句话），用户可纠正
   - Enhancement / Feature 完整流程见 `docs/tasks/FEATURE-WORKFLOW.md`

### 提交信息规范

```
feat(frontend): 实现格点 Canvas 渲染 Web Worker
fix(backend): 修正 /stats 接口月份参数验证
docs: 更新 data-pipeline 设计文档
chore(scripts): 新增 netcdf 批量预生成脚本
```

---

## 环境变量

后端（`conf/config.env`，开发时可放 `backend/.env`）：
```
PORT=8000
DB_PATH=../db/stats.db
STATIC_ROOT=../static
REPORT_DIR=../static/reports
GRID_DIR=../static/grid
```

前端（`frontend/.env`）：
```
VITE_API_BASE=/api/v1
VITE_GRID_BASE=/grid
VITE_AMAP_KEY=你的高德Key
```
