# CLAUDE.md — cwrvis 项目 Agent 工作指南

本文件是 AI Agent 参与 cwrvis 项目开发的主要参考文档。所有 Agent 会话开始前应完整阅读本文件，以及 `docs/design/` 下的相关设计文档。

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
│
├── docs/
│   └── design/
│       ├── overview.md        # 系统总体设计
│       ├── data-pipeline.md   # 数据预生成流程设计
│       ├── backend.md         # 后端 API 设计
│       ├── frontend.md        # 前端架构与渲染方案设计
│       └── deployment.md      # 部署与运维设计
│
├── data/
│   └── shapes/                # 预设区域边界 GeoJSON 文件（GCJ-02，来自高德开放平台）
│       ├── 西藏自治区.geojson
│       └── ...（各地市）
│
├── scripts/                   # 离线数据预生成脚本（Python）
│   ├── netcdf_to_json.py      # netcdf → 格点 JSON 切片
│   └── netcdf_to_sqlite.py    # netcdf × shape → SQLite 区域统计
│
├── backend/                   # FastAPI 后端
│   ├── main.py
│   ├── routers/
│   ├── models/
│   └── requirements.txt
│
├── frontend/                  # Vue 3 前端
│   ├── src/
│   │   ├── components/
│   │   ├── workers/           # Web Worker（格点渲染）
│   │   ├── composables/
│   │   └── config/            # 色卡、var 元数据等固化配置
│   ├── public/
│   └── package.json
│
└── deploy/
    ├── nginx.conf
    └── systemd/
```

---

## 技术栈

| 层级 | 技术选型 |
|------|----------|
| 后端框架 | Python 3.11+，FastAPI，uvicorn |
| 数据库 | SQLite（区域统计），无 ORM，直接 sqlite3 |
| 静态文件服务 | Nginx（格点 JSON、报告 docx） |
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

**格点渲染的偏移处理策略**：1度网格的视觉误差远大于GCJ-02偏移量（~500m），因此格点 Canvas 渲染按 WGS-84 正常计算，只在 ImageOverlay 绑定地图坐标时整体做边界框修正，不做逐点转换。

---

## 数据规模与文件组织

### 格点 JSON 切片

- 空间范围：中国区域，1度网格，约 60×70 = 4200 格点
- 时间颗粒度：年（2000–2024，共 25 份）、月（25年×12月，共 300 份）
- 变量数量：约 40–50 个 `data_var`
- 总切片数：约 16,250 个，总体积约 800MB

**命名规则**：
```
/static/grid/{granularity}/{var}/{year}.json          # 年颗粒度
/static/grid/{granularity}/{var}/{year}_{month}.json  # 月颗粒度
```

每个 JSON 文件的结构：
```json
{
  "var": "precipitation",
  "year": 2010,
  "month": null,
  "granularity": "year",
  "lat_min": 18, "lat_max": 53,
  "lon_min": 73, "lon_max": 135,
  "lat_size": 36, "lon_size": 63,
  "data": [[...], [...]]   // shape: lat_size × lon_size，NaN 用 null 表示
}
```

### SQLite 区域统计

数据库文件：`/static/db/stats.db`

主表结构：
```sql
CREATE TABLE region_stats (
    region_id   TEXT NOT NULL,
    granularity TEXT NOT NULL,   -- 'year' | 'month'
    year        INTEGER NOT NULL,
    month       INTEGER,         -- NULL when granularity='year'
    var         TEXT NOT NULL,
    value       REAL,
    PRIMARY KEY (region_id, granularity, year, month, var)
);
```

预计行数约 16 万行，文件体积 < 20MB。

### 预生成报告

文件存放目录：`/static/reports/`

命名规则（与甲方确认后固化）：
```
{region_id}_{granularity}_{start}_{end}.docx
# 示例：region_a_year_2000_2024.docx
#        region_b_month_2020_2023.docx
```

后端接口按此规则拼接路径，302 重定向到 Nginx 静态文件。

---

## 后端 API 约定

Base URL：`/api/v1`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/stats` | 查询区域统计数据 |
| GET | `/report/download` | 下载预生成报告 |
| GET | `/meta/vars` | 返回所有 var 的元数据（名称、单位、色卡等） |
| GET | `/meta/regions` | 返回所有预设区域的元数据 |

`/stats` 参数：
```
region_id   string   必填
granularity string   'year' | 'month'
year_start  int      必填
year_end    int      必填
var         string   必填，可多值（重复参数）
```

`/report/download` 参数：
```
region_id   string
granularity string
start       string   年颗粒度传年份，月颗粒度传 YYYY_MM
end         string
```

所有接口返回 JSON，统一结构：
```json
{ "ok": true, "data": { ... } }
{ "ok": false, "error": "message" }
```

---

## 前端核心模块

### 格点渲染流程（Web Worker）

```
主线程：fetch JSON → 传 ArrayBuffer 给 Worker
Worker：
  1. 解析二维数组
  2. 双线性插值（升采样至目标分辨率）
  3. 色卡映射（查表）
  4. 阈值过滤（低于/高于用户设定值 → alpha=0）
  5. 写入 ImageBitmap
主线程：将 ImageBitmap 贴为 MapLibre ImageSource/ImageLayer
```

### 时间轴播放器

- 默认暂停状态
- 播放间隔：800ms/帧（可配置）
- 预加载策略：当前帧 ±2 帧提前 fetch 并缓存
- 缓存结构：`Map<frameKey, ImageBitmap>`，最大缓存 20 帧，LRU 淘汰

### var 元数据（前端固化配置）

在 `frontend/src/config/vars.js` 中定义，示例结构：
```js
export const VAR_CONFIG = {
  precipitation: {
    label: '降水量',
    unit: 'mm',
    colorScale: [
      { value: 0,   color: '#f7fbff' },
      { value: 100, color: '#2171b5' },
      { value: 500, color: '#08306b' },
    ],
    description: '月/年累计降水量'
  },
  // ...
}
```

---

## 开发工作流约定

### 分支策略

```
main          生产可用代码
dev           集成分支
feature/*     功能开发
fix/*         问题修复
```

### Agent 工作规范

1. **每次会话开始**，必须阅读本文件（`CLAUDE.md`）和本次任务对应的 `docs/design/` 子文档
2. **修改涉及坐标处理的代码前**，必须重新确认"坐标系约定"章节
3. **新增 API 接口前**，检查"后端 API 约定"是否已覆盖，避免重复定义
4. **修改数据文件命名规则前**，必须同步更新本文档、相关设计文档、前后端代码中的所有引用
5. **不得**在前端直接发起对 netcdf 文件的请求，所有格点数据通过预生成 JSON 静态文件获取
6. **不得**在运行时执行 xarray/numpy 计算，所有计算在离线脚本阶段完成

### 提交信息规范

```
feat(frontend): 实现格点 Canvas 渲染 Web Worker
fix(backend): 修正 /stats 接口月份参数验证
docs: 更新 data-pipeline 设计文档
chore(scripts): 新增 netcdf 批量预生成脚本
```

---

## 环境变量

后端（`backend/.env`）：
```
DB_PATH=/data/static/db/stats.db
STATIC_ROOT=/data/static
REPORT_DIR=/data/static/reports
```

前端（`frontend/.env`）：
```
VITE_API_BASE=/api/v1
VITE_GRID_BASE=/static/grid
VITE_AMAP_KEY=你的高德Key
```

---

## 第一阶段验收标准

- [ ] 地图正常加载高德底图，可切换街道/卫星图层
- [ ] 至少 3 个 data_var 的格点数据可正确渲染（颜色、插值、透明度）
- [ ] 时间轴可播放，帧切换流畅无明显卡顿
- [ ] 色卡阈值过滤功能可用（点击分段隐藏）
- [ ] 至少 2 个预设区域可点击，显示统计图表
- [ ] 报告下载链接可正常触发文件下载
- [ ] 系统在公网服务器上稳定运行，响应时间合理

---

## 待确认事项（Pending）

| # | 问题 | 状态 |
|---|------|------|
| 1 | 区域边界 GeoJSON 已就绪（`data/shapes/`，GCJ-02，来自高德，含西藏全区及各地市）；甲方最终 shape 文件若另行提供，需确认坐标系 | ✅ 初始文件已入库 |
| 2 | 高德地图 API Key 申请与配额确认 | ⏳ 待申请 |
| 3 | 报告文件命名规则与甲方最终确认 | ⏳ 待确认 |
| 4 | 服务器 IP / 域名 / HTTPS 证书 | ⏳ 待运维提供 |
| 5 | 具体 data_var 列表与色卡参数 | ⏳ 待数据同事提供 |
