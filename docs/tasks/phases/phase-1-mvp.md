# Phase 1 — MVP 任务清单

**目标**：完成可演示、满足甲方验收的最小可用版本  
**验收标准**：见 [`TASK_LIST.md`](../../TASK_LIST.md) → "验收标准"节  
**工时标记**：`[S]` ≤半天  `[M]` 约1天  `[L]` 2–3天  
**依赖标记**：`← needs: X-NN` 表示必须在该任务完成后才能开始

---

## 关键路径

### S 系列（数据预生成）

```
S-01 ─┐
S-02  ├─→ S-04（Makefile 封装三个 target）
S-03 ─┘
```

S-01 / S-02 / S-03 互相独立，可全部并行；S-04 在三者完成后验证集成。

---

### B 系列（后端 API）

```
B-01 ─┬─→ B-02
      ├─→ B-03
      └─→ B-04
```

B-02 / B-03 / B-04 可在 B-01 完成后并行开发。

---

### F 系列（前端）

**基础设施（F-01 扇出）**

```
F-01 ─┬─→ F-02 ─┬─→ F-04
      │          └─→ F-19
      ├─→ F-03 ─┬─→ F-05 ─→ F-06
      │          └─→ F-07
      └─→ F-09
```

多父汇入说明：
- **F-08**：← F-02 + F-03（地图初始化依赖样式变量和 Pinia store）
- **F-18**：← F-04 + F-03（SettingsPanel 挂载于 ProductNav，依赖 settings store）

**格点渲染链（最长链）**

```
F-01 → F-02 ─┐
F-01 → F-03 ─┴─→ F-08 ─→ F-10 ─┬─→ F-11 ─→ F-13
F-01 → F-09 ─────────────↗       └─→ F-12
```

**区域统计链**

```
F-08 ─────────────────────→ F-14 ─┐
F-03 → F-05 → F-06 ───────────────┴─→ F-15 ─→ F-16
（F-15 还直接依赖 F-03）      └─→ F-17
```

**其余模块**

```
F-02 → F-04 ─┐
F-03 ─────────┴─→ F-18
F-02 ─────────────→ F-19
```

---

### D 系列（部署）

```
（S 全部 + B 全部 + F 全部）─→ D-01 ─┬─→ D-02
                                       └─→ D-03
```

D-02 / D-03 可在 D-01 完成后并行进行。

---

**全局最长链**（F 系列内）：F-01 → F-02/F-03 → F-08 → F-10 → F-11 → F-13 ≈ 11 天  
**可并行**：S / B / F 三系列完全独立，可同步推进；D 系列在三者全部完成后启动。

---

## S — Scripts / 数据预生成脚本

- [x] `DONE` **S-01** `[M]` netcdf_to_json.py：生成格点 JSON 全套文件
  - `year/{var}.json`（26帧）、`month/{var}.json`（312帧）
  - `mean_all/{var}.json`（1帧）、`mean_month/{var}.json`（12帧）、`mean_season/{var}.json`（4帧）
  - `meta.json`：网格坐标、`dxy`（m²，用于 kg→mm 换算）、时间轴、var 元数据
  - 输出：`static/grid/`（已 `.gitignore`，需在目标机器运行）

- [x] `DONE` **S-02** `[L]` netcdf_to_sqlite.py：生成区域统计 SQLite
  - **空间聚合 Strategy Pattern**（见 DEC-014、data-pipeline.md）：
    - `RegionAggregator` ABC：`prepare(region_geom, lats, lons)` + `aggregate(frame_2d, var_unit)`
    - `AreaWeightedMean`：geopandas 面积重叠权重，加权平均（默认，`--method area_weighted`）
    - `PointInBoundary`：中心点在边界内的格点；单位 `kg` → SUM，其余 → 算术平均（`--method point_in_boundary`）
    - `prepare()` 每区域调用一次，缓存权重/掩码，逐帧复用
  - **SQLite 宽表**（见 DEC-013）：
    - schema：`(region_id, granularity, year, month, SP, aveMv, ..., RCh)` — 15 var 为列
    - 仅存 `granularity IN ('year', 'month')` 原始值；派生聚合通过 SQL 在查询时计算
    - 主键：`(region_id, granularity, year, month)`
  - CLI 参数：`--nc-dir`、`--shape-dir`、`--db-path`、`--method`（默认 `area_weighted`）
  - 输出：`db/stats.db`（已加入 `.gitignore`）
  - **阻塞原因**：等待甲方提供 netcdf 原始数据

- [x] `DONE` **S-03** `[S]` shapes 处理：中文文件名 → region_id 命名
  - `data/shapes/西藏自治区.geojson` → `static/shapes/xizang.geojson`（及其余 7 个地市）
  - region_id 映射见 `backend/config.py` 的 `REGION_MAP`
  - 实现为 Makefile `shapes` target，集成到打包流程（D-01 依赖此项）

- [x] `DONE` **S-05** `[S]` scripts Python 环境管理（`scripts/pyproject.toml` + `make setup`）
  - 新增 `scripts/pyproject.toml`，声明数据处理依赖（numpy / xarray / netCDF4 / shapely）
  - Makefile：`data-grid` / `data-sqlite` / `data-sqlite-csv` 改用 `uv run --project scripts`；新增 `setup` target 一键初始化所有环境
  - CLAUDE.md 更新 Python 环境管理说明，反映两套独立 venv 的事实
  - `← needs: S-04`

- [x] `DONE` **S-04** `[M]` 根目录 Makefile（项目全流程构建脚本）
  - Targets（见 data-pipeline.md "项目构建脚本"节）：
    - `data-sqlite`：运行 S-02 脚本（支持 `METHOD=` 变量覆盖，默认 `area_weighted`）
    - `data-grid`：运行 S-01 脚本
    - `shapes`：执行 S-03 重命名逻辑
    - `frontend`：`nvm use && pnpm build`，产物 → `static/web/`
    - `package`：组装分发目录结构 + 打 `.tar.gz` 压缩包
    - `dev`：并发启动 FastAPI（8000）和 Vite dev server（5173）
    - `clean`：删除全部生成产物
  - `.PHONY` 声明所有非文件 target
  - 确保 `uv`、`nvm`、`pnpm` 的调用方式符合项目约束（uv run / corepack）

---

## B — Backend / 后端 API

> B 系列与前端 F 系列独立，可与 F-01~F-10 并行推进。

- [x] `DONE` **B-01** `[S]` FastAPI 入口完善（`backend/main.py`）
  - 挂载路由：`/api/v1/stats`、`/api/v1/report`、`/api/v1/meta`
  - StaticFiles 挂载：`/grid` → `GRID_DIR`、`/shapes` → `SHAPES_DIR`、`/` → 前端 build 产物
  - 开发阶段 CORS 配置（允许 localhost:5173）
  - `backend/config.py`：`REGION_MAP` 定义（8 个区域的 id→中文名映射）

- [x] `DONE` **B-02** `[M]` `/api/v1/stats` 接口（`routers/stats.py`）
  - 参数：`region_id`、`granularity`（5 种：`year`/`month`/`mean_all`/`mean_month`/`mean_season`）、`year_start`、`year_end`（2000–2025）；无 var 过滤参数，一次返回全部 15 个 var
  - 按 granularity 路由到对应 SQL（原始 SELECT / `AVG+GROUP BY month` / `AVG+GROUP BY season`）；详见 `data-pipeline.md` SQL 示例
  - 返回结构：`{ region_id, granularity, rows: [{year?, month?, season?, SP, CWR, ...}] }`
  - 参数校验：region_id 不存在 → 404；granularity 非法 → 400；year 范围非法 → 400
  - `← needs: B-01`，需要 `stats.db`（若 S-02 未完成可用空数据库开发接口骨架）

- [x] `DONE` **B-03** `[S]` `/api/v1/report/download` 接口（`routers/report.py`）
  - 按 `{region_id}_{granularity}_{start}_{end}.docx` 拼接路径，`FileResponse` 返回
  - 文件不存在 → 404 JSON；路径穿越校验（只允许访问 `REPORT_DIR` 内文件）
  - `← needs: B-01`

- [x] `DONE` **B-04** `[S]` `/api/v1/meta/regions` 接口（`routers/meta.py`）
  - 从 `REGION_MAP` 硬编码返回区域列表（`region_id`、`name`、`level`）
  - 无数据库查询
  - `← needs: B-01`

---

## F — Frontend / 前端

### 基础设施

- [x] `DONE` **F-01** `[M]` 项目初始化
  - `pnpm create vue@latest`，选 TypeScript + Vite；`.nvmrc` 固化 Node v24.15.0
  - 安装：`maplibre-gl` ≥4.0、`echarts` ≥5.5、`pinia` ≥2.0
  - `tsconfig.json` 严格模式（`strict: true`，`noUncheckedIndexedAccess: true`）
  - `types/index.ts`：VarName、RegionId、AggMode、Season、FrameSel、BasemapId 等
  - Vite dev proxy：`/api` → `http://localhost:8000/api`、`/grid` → `http://localhost:8000/grid`

- [x] `DONE` **F-02** `[S]` 全局样式与设计系统
  - `styles/variables.css`：所有 CSS 变量（`--bg-*`、`--fg-*`、`--accent`、`--font-*`、布局尺寸）
  - 全局 reset，MapLibre 样式覆盖（去圆角、深色控件），自定义滚动条
  - `← needs: F-01`

- [x] `DONE` **F-03** `[M]` Pinia stores + 配置文件骨架
  - `stores/time.ts`：`mode: AggMode`、`sel: FrameSel`、`playing: boolean`
  - `stores/var.ts`：`selVar: VarName`
  - `stores/region.ts`：`selRegionId: RegionId`、`regions: RegionMeta[]`、`statsCache: Map`
  - `stores/meta.ts`：启动时 fetch `/grid/meta.json`，存储 GridMeta
  - `stores/settings.ts`：从 localStorage 初始化，写入时同步持久化（见 DECISIONS.md DEC-011）
  - `config/vars.ts`：15 个 var 元数据（`long_name`、`units`、色卡控制点、量程 vmin/vmax）
  - `config/basemaps.ts`：4 种底图配置（见 DECISIONS.md DEC-004）
  - `config/constants.ts`：`YEAR_MIN=2000`、`YEAR_MAX=2025`、`SEASONS` 定义（春MAM/夏JJA/秋SON/冬DJF）
  - `← needs: F-01`

### 布局 Chrome

- [x] `DONE` **F-04** `[S]` ProductNav 组件
  - 7 个 Tab，激活态：accent 色文字 + 底部 2px accent 线
  - 右端：`?` 占位 + `⚙` 打开 SettingsPanel + 用户标识"研究员"
  - 品牌：五边形 SVG（clip-path）+ "云水资源数据平台" + 副标题
  - Tab 切换驱动 `App.vue` 渲染对应模块组件
  - `← needs: F-02`

- [x] `DONE` **F-05** `[M]` LeftRail + CategoryFlyout 组件
  - 5 个分组图标（自绘 SVG inline，22×22，currentColor）+ 搜索 + 导出占位
  - 点击图标 → 弹出 260px 宽 CategoryFlyout，含搜索框 + 变量列表（code / long_name / units）
  - 当前 selVar 所属分组图标始终激活（即使 Flyout 已关闭）
  - 点击变量 → 更新 selVar → 关闭 Flyout
  - 仅在 `grid` / `region` 模块显示
  - `← needs: F-03`

- [x] `DONE` **F-06** `[M]` SubToolbar 组件（三种形态）
  - **grid 形态**：VarDropdown（点击展开，按分组列出所有 var）+ 两组聚合模式按钮（原始/统计）+ 右侧模式参数（随 mode 动态变化）
  - **region 形态**：继承 grid，在聚合模式右侧追加 RegionPicker（下拉，支持全区 + 各地市分组）；与地图点击双向联动
  - **export 形态**：RegionPicker + 年份下拉（全部/2000–2025）
  - `← needs: F-03, F-05`

- [x] `DONE` **F-07** `[L]` BottomBar 时间轴组件
  - 5 种模式各自的帧序列生成（312 / 26 / 12 / 4 / 1 帧）
  - 控件：`[◀ 上一帧] [▶/⏸ 播放] [▶ 下一帧]` + MODE 标签 + FRAME 显示 + 速度选择器
  - 播放：setInterval 驱动（见 DEC-010），速度按模式持久化（见 DEC-011）
  - 刻度轨道：major/minor tick，点击/拖拽跳帧，当前帧游标
  - 键盘：← → Space（输入框获焦时失效）
  - 年平均（1帧）：隐藏播放控件，显示"静态帧"提示
  - `← needs: F-03`

### 地图与格点渲染

- [x] `DONE` **F-08** `[S]` MapView 组件（MapLibre 初始化）
  - `composables/useMap.ts`：创建 MapLibre Map 实例，初始视野西藏区域（zoom ~5）
  - 底图切换：响应 `settings.basemap` 变化，调用 `map.getSource('basemap').setTiles()`
  - 预留 ImageSource slot（`grid-overlay`）供 useGridLayer 使用
  - `← needs: F-02, F-03`

- [x] `DONE` **F-09** `[M]` Web Worker（`workers/gridRenderer.worker.ts`）
  - 消息入参：`{ frame2d: (number|null)[][], colormap: string, lut: Uint8ClampedArray, threshMin: number, threshMax: number, targetW: number, targetH: number }`
  - 步骤：双线性插值（15×25 → targetW×targetH）→ LUT 色卡查表 → 阈值过滤（null 或超出范围 → alpha=0）→ `createImageBitmap`
  - 返回：`{ imageBitmap: ImageBitmap }` via `postMessage(msg, [imageBitmap])`（Transferable）
  - LUT 由主线程预计算（256步 RGBA，见 DEC-015），Worker 只做查表
  - `← needs: F-01`

- [x] `DONE` **F-10** `[L]` useGridLayer composable
  - fetch `/grid/{gran}/{var}.json`，解析，缓存全量数据（内存）
  - 按 `sel` 提取当前帧二维数组 → postMessage 给 Worker → 收到 ImageBitmap → 更新 MapLibre ImageSource
  - LRU 帧缓存（20帧 ImageBitmap），预加载 ±2 帧
  - 响应 `selVar`、`mode`、`sel`、`colormap`、`threshMin/Max` 变化自动重渲
  - `← needs: F-08, F-09`

### 格点数据模块

- [x] `DONE` **F-11** `[M]` GridModule 容器 + 地图取值点交互
  - `HoverTooltip.vue`：跟随鼠标，显示双线性插值数值 + 单位（`pointer-events: none`，绝对定位）
  - `PinTip.vue`：固定取值点气泡，绑定地图投影坐标，随时间轴切帧自动重新插值更新数值；含 [查看历史 ↗] 和 [✕ 清除] 按钮
  - 十字光标 Marker（4px 描边圆 + 十字线，SVG 实现）
  - Escape 键清除取值点；地图拖拽时 PinTip 跟随
  - `← needs: F-10`

- [x] `DONE` **F-12** `[M]` Legend + Inspector 面板（Right Stack）
  - `Legend.vue`：
    - 变量名 + long_name + unit + 插值方法说明
    - MIN / MEAN / MAX 统计卡（当前帧全域）
    - 色标条（canvas 渲染渐变）+ 量程刻度
    - Colormap 选择器：5 个色带方块（Viridis/Turbo/Magma/Cyan/RdBu），按 var 持久化
    - **阈值控制**：min/max 两个数值输入框（或拖拽手柄），写入 `threshMin/Max` → 触发 Worker 重渲（验收标准要求，见 DEC-015 / F-09）
  - `Inspector.vue`：
    - 格点模式：坐标 / 时间 / 变量名 / 大字数值 + 单位 / 分位条（相对当前帧 min/max）/ [查看历史] [清除]
    - 区域模式：区域名 / 时间 / 变量名 / 区域统计数值 / [查看历史] [清除]
  - 面板位置（左/右）响应 `settings.legendPosition`
  - `← needs: F-10`

- [x] `DONE` **F-13** `[M]` HistoryModal（格点数据模式）
  - 4 个 Tab：逐月（312帧）/ 逐年（26帧）/ 多年月均（12帧）/ 多年季均（4帧）
  - **数据来源**：纯前端，从已加载的格点 JSON 对 `picked.{lat, lon}` 做双线性插值；按需 fetch 尚未加载的 JSON（见 DEC-012 类比逻辑）
  - ECharts 折线图（深色主题配置，背景 `--bg-1`，线色 `--accent`）：
    - 当前帧：`--warn` 色竖线高亮
    - 悬停：ECharts tooltip（时间 + 数值）
    - 点击某帧 → 更新 `stores/time.sel` → 关闭 Modal
  - 统计卡片（图表上方）：帧数 / MIN / MEAN / MAX / 极值时刻
  - Modal 尺寸：880×560，全屏半透明遮罩 + backdrop-blur
  - `← needs: F-11`

### 区域统计模块

- [x] `DONE` **F-14** `[M]` useRegionLayer composable
  - 加载所有区域的 GeoJSON（`/shapes/{region_id}.geojson`，并行 fetch）
  - 坐标系修正：若底图为 GCJ-02 则不处理；若为 WGS-84 则整体偏移（见 DEC-005）
  - MapLibre Source + 两个 Layer：FillLayer（透明度由 feature-state 驱动）+ LineLayer（边界线）
  - 四种视觉状态（见 `docs/design/frontend.md` 区域高亮表）：轮廓 / 地市边界 / 悬停 / 选中
  - 响应 `selRegionId` 变化更新 feature-state
  - `← needs: F-08`

- [x] `DONE` **F-15** `[M]` RegionModule 容器 + 区域交互
  - 进入模块或切换区域/聚合模式时：按需请求 `GET /api/v1/stats?region_id={id}&granularity={mode}&year_start=2000&year_end=2025`；先查 `statsCache`（key: `{regionId}_{granularity}`），命中则跳过请求
  - 返回数据为全部 15 var 的宽表行，缓存后直接读取当前 selVar 对应列渲染 Inspector
  - 地图 click 事件：命中地市 → 更新 `selRegionId` → 联动 SubToolbar RegionPicker
  - 地图 hover 事件：命中地市 → feature-state 悬停高亮 + HoverTooltip（地市名 + 当前帧统计数值，从已缓存数据读取）
  - 区域外点击：无响应
  - `← needs: F-06, F-14, F-03`

- [x] `DONE` **F-16** `[L]` HistoryModal（区域统计模式）
  - **数据来源**：`/api/v1/stats`（后端 SQLite），statsCache 中有则复用；全部 4 个 Tab 均来自后端，无客户端计算
  - 4 个 Tab：逐月（`month`，312帧）/ 逐年（`year`，26帧）/ 月平均（`mean_month`，12帧）/ 季平均（`mean_season`，4帧）
  - ECharts 折线图，**多变量叠加**：
    - 默认加载 `selVar` 数据
    - "+ 添加变量"按钮 → VarPicker → 发起请求 → 追加折线（不同颜色）
    - 同单位：共用一条 Y 轴；不同单位：增加右侧 Y 轴（最多 2 条）
    - 图例可点击显示/隐藏各变量
  - 当前帧 `--warn` 色竖线，点击跳帧（同格点模式）
  - 统计卡片（每个激活变量独立一组）
  - `← needs: F-15`

### 其余模块

- [x] `DONE` **F-17** `[S]` ExportModule（数据导出）
  - 居中卡片布局；RegionPicker（复用 F-06 中的同名组件）+ 年份下拉
  - 下载：构造 URL → `<a href download>` 触发；后端 404 → 页面内行内错误提示
  - `← needs: F-06`

- [x] `DONE` **F-18** `[S]` SettingsPanel（用户设置）
  - Overlay 面板（点击遮罩关闭）
  - 底图选择：4 个 radio，选中立即生效（`settings.basemap` → `useMap` 响应）
  - 图例位置：左/右 radio
  - "恢复默认值"按钮：清除所有 `cwrvis:` localStorage key → `window.location.reload()`
  - `← needs: F-03, F-04`

- [x] `DONE` **F-19** `[S]` PlaceholderModule（占位模块）
  - 总览 / 时序分析 / 站点观测 / 模式诊断共用
  - 显示模块编号 + 名称 + "该模块正在建设中"，风格与主题一致
  - `← needs: F-02`

---

## D — Deploy / 部署与运维

- [ ] `TODO` **D-01** `[M]` 分发包结构与打包脚本
  - 目录：`cwrvis-{version}/bin/`、`app/`、`static/{grid,web,shapes,reports}/`、`db/`、`conf/`、`logs/`
  - `bin/start.sh`：检查 `.venv`，`source conf/config.env`，启动 uvicorn（2 workers）
  - `bin/stop.sh`：`pkill -f uvicorn`（或读 PID 文件 graceful stop）
  - 打包通过根目录 `Makefile` 的 `make package` target 完成（见 S-04）
  - `← needs: S-03, S-04, B-01~B-04, F-01~F-19`

- [ ] `TODO` **D-02** `[S]` systemd service 配置
  - `deploy/systemd/cwrvis.service`：`WorkingDirectory`、`ExecStart`（绝对路径 `bin/start.sh`）、`Restart=on-failure`、`RestartSec=5`
  - `← needs: D-01`

- [ ] `TODO` **D-03** `[S]` 网络配置说明（`docs/design/deployment.md` 更新）
  - 直连方案：uvicorn 直接监听 0.0.0.0:8000，无 Nginx
  - 可选 Nginx 反代：upstream 配置模板，静态文件 `/grid/` 走 Nginx 直出
  - HTTPS：Let's Encrypt certbot 配置示例
  - `← needs: D-01`（配置编写不依赖，但测试依赖 D-01）

---

## 进度统计

| 模块 | 总计 | ✅ DONE | 🔄 IN_PROGRESS | 📋 TODO | 🚫 BLOCKED |
|------|:----:|:-------:|:--------------:|:-------:|:----------:|
| S 脚本 | 5 | 5 | 0 | 0 | 0 |
| B 后端 | 4 | 4 | 0 | 0 | 0 |
| F 前端 | 19 | 19 | 0 | 0 | 0 |
| D 部署 | 3 | 0 | 0 | 3 | 0 |
| **合计** | **31** | **28** | **0** | **3** | **0** |

**预估剩余工时**（单人）：约 2–4 天（仅剩 D 系列 3 项部署任务）
