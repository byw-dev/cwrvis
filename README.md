# cwrvis

气候/水资源格点数据可视化与区域统计分析系统。基于 WebGIS 展示西藏地区的云水资源格点场，支持时间轴播放、区域统计查询与报告下载。

---

## 功能

- 格点数据叠加层：双线性插值、色卡映射、阈值过滤，支持 kg→mm 单位换算
- 时间轴控制：年/月两种颗粒度，播放/逐帧切换，预加载优化
- 区域统计：点击地市查询时间序列，多变量图表对比
- 报告下载：按区域和时间段下载预生成 `.docx` 报告

## 技术栈

| 层 | 选型 |
|----|------|
| 后端 | Python 3.11 · FastAPI · SQLite |
| 前端 | Vue 3 · Vite · MapLibre GL JS · ECharts |
| 数据预生成 | xarray · geopandas · numpy |
| 构建 | uv（Python）· pnpm + corepack（Node） |

## 前置依赖

| 工具 | 版本 | 用途 |
|------|------|------|
| [uv](https://docs.astral.sh/uv/) | 最新 | Python 环境管理 |
| [nvm](https://github.com/nvm-sh/nvm) | — | Node.js 版本管理 |
| Node.js | v24.15.0（`.nvmrc` 固化） | 前端构建 |
| corepack | 随 Node 附带 | pnpm 版本管理 |

> **数据依赖**：运行前需要甲方提供的原始数据（见"数据准备"节）。

## 快速开始（开发环境）

```bash
# 1. 初始化所有 Python / Node.js 环境（首次 clone 后运行一次）
make setup

# 2. 准备数据（见下方"数据准备"节）

# 3. 启动开发服务器（后端 :8000 + 前端 :5173，Ctrl+C 同时停止）
make dev
```

浏览器打开 `http://localhost:5173`。

## 数据准备

系统运行时依赖两类离线预生成数据，选择其中一条路径执行：

**路径 A — 从预计算 CSV 导入（推荐，数据口径与甲方一致）**

```bash
# 将甲方提供的 CSV 文件放入 data/csv/yearly/ 和 data/csv/monthly/
# 文件命名格式：{region_id}_NCEP_00to25_{Y|M}_client.csv

make data-sqlite-csv   # 生成 db/stats.db
make data-grid         # 生成 static/grid/（需要 data/nc/ 原始 netcdf）
make shapes            # 复制区域 GeoJSON 到 static/shapes/
```

**路径 B — 从 netcdf 原始数据生成（无预计算 CSV 时使用）**

```bash
# 将甲方提供的 netcdf 文件放入 data/nc/yearly/ 和 data/nc/monthly/

make data              # 一次性生成 db/stats.db + static/grid/ + static/shapes/
```

预生成报告（`.docx`）放入 `static/reports/`，命名格式见 `docs/design/backend.md`。

## 生产部署

```bash
# 构建机打包（产物含离线 wheel 缓存，支持目标机无网安装）
make package VERSION=1.0.0
# → dist/cwrvis-1.0.0.tar.gz

# 目标机（Linux x86_64）
tar xf cwrvis-1.0.0.tar.gz -C /opt
cd /opt/cwrvis-1.0.0
bin/start.sh
```

详细部署步骤、systemd 配置、环境变量说明见 [`docs/design/deployment.md`](docs/design/deployment.md)。

## 文档

| 文档 | 内容 |
|------|------|
| [`TASK_LIST.md`](TASK_LIST.md) | 任务进度导航 |
| [`DECISIONS.md`](DECISIONS.md) | 技术决策记录 |
| [`docs/design/overview.md`](docs/design/overview.md) | 系统总体设计 |
| [`docs/design/data-pipeline.md`](docs/design/data-pipeline.md) | 数据预生成流程与格式规范 |
| [`docs/design/backend.md`](docs/design/backend.md) | 后端 API 详细规格 |
| [`docs/design/frontend.md`](docs/design/frontend.md) | 前端架构与渲染方案 |
| [`docs/design/deployment.md`](docs/design/deployment.md) | 部署与运维 |
| [`CLAUDE.md`](CLAUDE.md) | AI Agent 工作指南 |
