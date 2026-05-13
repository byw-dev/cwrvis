# 系统总体设计 — cwrvis

> 文档版本：v1.0  
> 阶段：第一阶段 MVP

---

## 系统定位

cwrvis 是一套气候/水资源格点数据可视化与区域统计分析系统，采用 B/S 架构。第一阶段目标为快速交付可演示版本，满足甲方验收要求。

系统的核心设计原则是**预计算优先**：将所有计算密集型任务（netcdf 解析、区域统计、报告生成）移到离线脚本阶段完成，运行时只做数据读取和展示，以最大限度降低后端复杂度和服务器资源要求。

---

## 架构全景

```
┌─────────────────────────────────────────────────────────────┐
│                        离线预生成（一次性）                    │
│                                                             │
│  netcdf 文件  ──→  scripts/netcdf_to_json.py               │
│                         │                                   │
│                         └──→ static/grid/                   │
│                              ├── meta.json                  │
│                              ├── year/{var}.json            │
│                              └── month/{var}.json           │
│                                                             │
│  netcdf × shape ──→  scripts/netcdf_to_sqlite.py           │
│                         │                                   │
│                         └──→ db/stats.db（区域统计，SQLite）  │
│                                                             │
│  报告生成脚本（同事提供）──→ static/reports/*.docx            │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                        运行时系统（单进程）                    │
│                                                             │
│  ┌──────────────┐         ┌──────────────────────────────┐ │
│  │   Browser    │◄───────►│   FastAPI（uvicorn）          │ │
│  │  (Vue 3 +   │         │                              │ │
│  │  MapLibre)  │         │  /api/v1/**  → 读取 SQLite   │ │
│  │             │         │  /grid/**   → StaticFiles    │ │
│  │             │         │  /reports/**→ StaticFiles    │ │
│  │             │         │  /          → 前端 SPA        │ │
│  └──────────────┘         │                              │ │
│                           │  db/stats.db（不对外暴露）    │ │
│                           └──────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

## 数据流

### 格点可视化数据流

```
用户选择 var + 时间 + 颗粒度
    │
    ▼
前端拼接 URL：/grid/{gran}/{var}.json
    │
    ▼
fetch JSON（浏览器缓存友好）
    │
    ▼
传入 Web Worker
    │
    ▼
双线性插值 → 色卡映射 → 阈值过滤 → ImageBitmap
    │
    ▼
MapLibre ImageSource 更新 → 渲染到地图
```

### 区域统计数据流

```
进入区域统计模块，或切换区域/聚合模式
    │
    ▼
GET /api/v1/stats?region_id=X&granularity={mode}&year_start=2000&year_end=2025
    │  （单请求，返回全部 15 个 var；statsCache 命中则跳过）
    ▼
后端按 granularity 执行对应 SQL（SELECT / AVG+GROUP BY month / AVG+GROUP BY season）
    │
    ▼
前端缓存响应到 Pinia statsCache（key: {region_id}_{granularity}）
    │
    ▼
渲染 Inspector 面板（当前帧统计数值）+ 悬停 tooltip
    │
[查看历史] → HistoryModal → ECharts 折线图（4 个 Tab，支持追加多变量叠加对比）
```

### 报告下载数据流

```
用户选择区域 + 颗粒度 + 时间范围 → 点击下载
    │
    ▼
GET /api/v1/report/download?region_id=X&granularity=year&start=2000&end=2024
    │
    ▼
FastAPI 按命名规则拼接文件路径 → 检查文件存在 → 返回文件流
（或 302 重定向到 Nginx 静态路径）
```

---

## 模块划分

| 模块 | 路径 | 责任 | 详细设计 |
|------|------|------|---------|
| 数据预生成脚本 | `scripts/` | netcdf → JSON + SQLite | [data-pipeline.md](./data-pipeline.md) |
| 后端 API | `backend/` | 统计查询、报告下载、元数据 | [backend.md](./backend.md) |
| 前端应用 | `frontend/` | 地图、渲染、交互 | [frontend.md](./frontend.md) |
| 部署配置 | `deploy/` | Nginx、systemd、环境配置 | [deployment.md](./deployment.md) |

### 前端功能模块

第一阶段实现的三个功能模块：

| 模块 | Tab | 功能 |
|------|-----|------|
| 格点数据 | `02 格点数据` | 格点色块渲染、5 种聚合模式、时间轴播放、取值点历史 |
| 区域统计 | `03 区域统计` | 继承格点数据，加载区域边界、区域点选高亮、区域统计历史（多变量） |
| 数据导出 | `07 数据导出` | 按区域+年份下载预生成报告 |

其余 4 个 Tab（总览/时序分析/站点观测/模式诊断）第一阶段为占位页。

---

## 关键约束与决策记录

> 详细决策内容见项目根目录 [`DECISIONS.md`](../../DECISIONS.md)，此处仅列摘要。

| 决策 ID | 标题 | 结论 |
|---------|------|------|
| DEC-001 | 格点数据分发方式 | JSON 静态文件，FastAPI StaticFiles 托管 |
| DEC-002 | 区域统计存储 | SQLite，无 ORM，直接 sqlite3 |
| DEC-003 | 报告生成方式 | 离线预生成 .docx，运行时只做下载 |
| DEC-004 | 地图底图 | 默认 OSM，可切换高德/Carto，用户设置持久化 |
| DEC-005 | GCJ-02 偏移处理 | 整体边界框修正，不做逐点转换 |
| DEC-006 | 前端语言 | TypeScript 全量，严格模式 |
| DEC-007 | 图表库 | ECharts（放弃自绘 Canvas） |
| DEC-010 | 时间轴播放驱动 | setInterval（非 rAF，避免失焦暂停） |
| DEC-011 | 用户设置持久化 | localStorage，无鉴权 |
| DEC-012 | 统计聚合计算位置 | 前端客户端计算（不预生成，不新增接口） |
| DEC-013 | 格点渲染架构 | Web Worker + OffscreenCanvas + ImageBitmap Transferable |

---

## 非目标（第一阶段不做）

- 用户登录与权限管理
- 数据实时更新
- 自定义区域绘制
- 格点数据导出
- 多用户并发大流量支持
- 移动端适配
- 自定义报告内容
