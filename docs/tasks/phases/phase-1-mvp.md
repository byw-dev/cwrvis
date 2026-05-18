# Phase 1 — MVP 任务清单

**目标**：完成可演示、满足甲方验收的最小可用版本  
**工时标记**：`[S]` ≤半天  `[M]` 约1天  `[L]` 2–3天  
**依赖标记**：`← needs: X-NN` 表示必须在该任务完成后才能开始

## 验收标准

- [ ] 地图正常加载底图（默认 OSM，可切换高德街道/卫星）— **F-08、F-18**
- [ ] ≥3 个 data_var 的格点数据可正确渲染（颜色、双线性插值、透明度）— **F-09、F-10、F-11**
- [ ] 时间轴可播放，帧切换流畅无明显卡顿 — **F-07、F-10**
- [ ] 色卡阈值过滤可用（图例上设置 min/max 隐藏超出范围的格点）— **F-12**
- [ ] ≥2 个预设区域可点击，显示区域统计图表 — **F-14、F-15、F-16**
- [x] 报告下载链接可正常触发文件下载（选区域 + 年份，下载对应 docx）— **S-07、B-07、F-25**
- [ ] 系统在公网服务器上稳定运行，响应时间合理 — **D-01、D-02**

> ⚠️ 若甲方验收要求强制使用高德底图，需申请 API Key（见 backlog.md P-2）并将 `settings.basemap` 默认值改为 `'amap_street'`。

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

- [x] `DONE` **S-06** `[S]` region_areas 表写入 stats.db
  - 两条路径均在同一次脚本运行中写入 `region_areas(region_id, area_m2)` 表
  - **路径 A**（`netcdf_to_sqlite.py`）：`prepare()` 阶段一并计算；`AreaWeightedMean`：`Σ(dxy × overlap_ratio)`；`PointInBoundary`：`Σ(dxy[mask])`
  - **路径 B**（`csv_to_sqlite.py`）：从 CSV 首行读 `dxy` 列（区域总面积），写入 `area_m2`
  - `← needs: S-02`

- [x] `DONE` **S-05** `[S]` scripts Python 环境管理（`scripts/pyproject.toml` + `make setup`）
  - 新增 `scripts/pyproject.toml`，声明数据处理依赖（numpy / xarray / netCDF4 / shapely）
  - Makefile：`data-grid` / `data-sqlite` / `data-sqlite-csv` 改用 `uv run --project scripts`；新增 `setup` target 一键初始化所有环境
  - CLAUDE.md 更新 Python 环境管理说明，反映两套独立 venv 的事实
  - `← needs: S-04`

- [x] `DONE` **S-08** `[S]` 色卡预设量程生成管线
  - `data/colorbars/` 4 个 CSV 入 git（Year_Kg/mm、month_Kg/mm，小文件，视为配置数据）
  - `scripts/generate_colorbars.py`：读取 4 个 CSV → 过滤系统 15 个 var → 生成 `frontend/src/config/colorbars.ts`（嵌套结构 `COLORBAR_PRESETS[varName]['year'|'month']['kg'|'mm']`）
  - Makefile 新增 `make colorbars` target；`colorbars.ts` 也入 git（前端构建产物，小文件）
  - 文档：CSV 更新时须重跑 `make colorbars` 并 commit 生成文件

- [x] `DONE` **S-07** `[S]` 报告文档复制：`data/docx/ → static/reports/`
  - Makefile 新增 `data-reports` target：`rsync -a --include="*.docx" data/docx/ static/reports/`（保留子目录结构）
  - `.gitignore` 补充 `data/docx/`（已完成）
  - CLAUDE.md / backend.md 更新仓库结构说明（已完成）
  - 更新 `data` target 依赖，使 `make data` 也包含报告复制
  - `← needs: data/docx/ 目录就绪（甲方提供）`

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

- [x] `DONE` **B-03** `[S]` `/api/v1/report/download` 接口初版（已被 B-07 替代）
  - 旧参数设计 `{region_id}_{granularity}_{start}_{end}.docx` 与甲方实际文件命名不符
  - `← needs: B-01`

- [x] `DONE` **B-07** `[S]` 报告接口重写 + 报告元数据接口（`routers/report.py`）
  - **新增** `GET /api/v1/report/meta`：启动时扫描 `REPORT_DIR` 一次，结果缓存模块级变量；返回各区域实际存在的年份列表和 `has_multi` 标记（见 `docs/design/backend.md`）
  - **重写** `GET /api/v1/report/download`：参数简化为 `region_id` + `year`（`"2000"`~`"2025"` 或 `"multi"`）；文件命名对齐甲方实际格式；安全控制：枚举白名单 + 正则校验 + 路径前缀断言（见 backend.md）
  - `← needs: S-07（static/reports/ 就绪后可完整测试）`

- [ ] `TODO` **B-08** `[S]` `/report/download` 下载前模拟延迟
  - 文件确认存在后（路径断言通过、`os.path.exists` 为真）、`FileResponse` 返回前，执行 `await asyncio.sleep(random.uniform(8, 12))`
  - 仅成功路径延迟；400 / 404 立即返回
  - 端点改为 `async def`；顶部 `import asyncio, random`
  - `← needs: B-07`
  - `→ needed by: F-29`

- [x] `DONE` **B-04** `[S]` `/api/v1/meta/regions` 接口（`routers/meta.py`）
  - 从 `REGION_MAP` 硬编码返回区域列表（`region_id`、`name`、`level`）
  - 无数据库查询
  - `← needs: B-01`

- [x] `DONE` **B-05** `[S]` `/api/v1/meta/regions` 新增 `area_m2` 字段

- [x] `DONE` **B-06** `[S]` 修正 `mean_season` 两步聚合 SQL
  - 原逻辑：月度数据直接 `AVG+GROUP BY season`，kg 列数值约为季度总量的 1/3（错误）
  - 新逻辑：CTE `season_per_year`（kg 列 `SUM`，非 kg 列 `AVG`，按年+季分组）→ 外层 `AVG GROUP BY season`
  - `KG_VARS` 列表加入 `backend/config.py`，供 SQL 生成器区分聚合算子
  - 季节定义：自然年（winter = month IN (1,2,12)，不跨历年）
  - `← needs: B-02`
  - JOIN `stats.db` 的 `region_areas` 表，将 `area_m2` 追加到每个区域元数据
  - 若区域无面积记录，`area_m2` 返回 `null`（不阻断响应，前端降级禁用换算）
  - `← needs: B-04, S-06`

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

- [x] `DONE` **F-17** `[S]` ExportModule 骨架（已被 F-25 完善）
  - 居中卡片布局；RegionPicker + 年份下拉；下载按钮骨架
  - `← needs: F-06`

- [x] `DONE` **F-26** `[S]` 色卡量程模式（Enhancement）
  - 修复 BUG-20：`pendingKeys: Set<string>` 防止同一 frameKey 重复发送 Worker，消除 `{vmin:0, vmax:1}` 缓存污染
  - 删除 `legendPosition`（dead code：settings store、SettingsPanel、localStorage key）；图例固定右侧
  - settings store 新增 `scaleMode: 'auto' | 'preset'`（localStorage `cwrvis:scale_mode`）
  - SettingsPanel UI：原"图例位置"改为"量程模式"（自动/预设 radio）
  - `useGridLayer.sendToWorker`：优先级 = 用户输入 > 预设 > 自动；`avg_season` 模式始终走自动
  - `scaleMode` 变化时 `imageCache.clear()` + 重渲（与 colormap 切换一致）
  - `← needs: S-08（colorbars.ts 就绪）`

- [x] `DONE` **F-25** `[S]` ExportModule 完整实现（对接 B-07 真实接口）
  - mount 时请求 `/api/v1/report/meta`，用返回数据驱动区域和年份下拉（含"多年汇总"选项）
  - **不使用 regionStore**，ExportModule 完全独立状态，与区域统计模块无关联
  - 区域下拉展示全部 8 个区域（xizang 省级 + 7 个地市），顺序与 REGION_MAP 一致
  - 年份下拉：展示实际存在的年份 + "多年汇总"（仅 `has_multi: true` 时显示）
  - 下载：`fetch /api/v1/report/download?region_id=...&year=...` → blob → `<a>` 触发
  - 后端 404 → 行内错误提示；meta 加载失败 → 提示占位
  - `← needs: B-07, F-17`

- [x] `DONE` **F-29** `[S]` ExportModule 伪进度条遮罩（Enhancement）
  - 点击"下载报告"后，在模块区域内显示加载遮罩：
    - 文字："正在生成报告，请稍候..."
    - 伪进度条：JS `setInterval` 驱动，约 9s 内线性推进至 90%，随后停在 90% 等待后端响应
    - 下载按钮在遮罩显示期间禁用（不可重复触发）
  - fetch 响应到达后：
    - 成功（200）：进度条跳至 100%，`setTimeout(300ms)` 后触发浏览器下载，关闭遮罩
    - 失败（404/400）：立即关闭遮罩，显示现有行内错误提示（不延迟）
  - 帮助文本同步简化：`"ℹ 报告为 .docx 格式，由数据团队预生成。若所选组合暂无报告，将在此处提示..."` → `"ℹ 报告为 .docx 格式。"`
  - `← needs: B-08`

- [x] `DONE` **F-27** `[M]` RegionHistoryModal 年平均 Tab + 静态表格（Enhancement）
  - TABS 末尾追加 `{ key: 'avg_yearly', label: '年平均', mode: 'avg_yearly' }`
  - `activeTab === 'avg_yearly'` 时：隐藏 ECharts 图表 + "追加变量"按钮 + 当前帧竖线；改为渲染 `<table>`：
    - **第一列**：变量英文 key（如 `SP`）；hover 时 tooltip 显示中文名 + 单位（来自 `frontend/src/config/vars.ts`）
    - **第二列**：数值，格式与图表 tooltip 一致；`null` → `—`
    - kg→mm 开关对 KG_VARS 生效（`value / area_m2`）；其余变量不换算
    - 行数 = 15，顺序与 vars.ts 定义顺序一致
  - 数据来源：`loadStats(regionId, 'avg_yearly')` → 后端 `mean_all` → 单行，直接读字段值
  - `← needs: F-16, B-05`

- [x] `DONE` **F-28** `[S]` RegionHistoryModal CSV 导出（Enhancement）
  - 模态框标题栏右侧新增"⬇ 导出 CSV"按钮（与关闭按钮并列）
  - 点击时从 statsCache 取当前 Tab 已加载数据（无需额外请求），构建 CSV 字符串：
    - **第一列**（时间列）：
      | Tab | 列头 | 值格式 |
      |-----|------|--------|
      | 逐年 | `year` | `YYYY` |
      | 逐月 | `year_month` | `YYYY-MM` |
      | 年平均 | `period` | `"2000-2025"` |
      | 月平均 | `month` | `1`…`12` |
      | 季平均 | `season` | `spring/summer/autumn/winter` |
    - **其余15列**：英文 key（`SP, CWR, aveMv, ...`），顺序与 vars.ts 一致
    - 值：kg→mm 开关对 KG_VARS 生效；`null` → 空字符串
    - 编码：UTF-8（内容全 ASCII，无乱码风险）
  - 文件名：`{regionName}-{modeLabel}-云水资源数据.csv`
    - `regionName`：取 `metaStore.regions` 中对应 `name` 字段（中文，如"阿里地区"）
    - `modeLabel`：当前 Tab label（逐月/逐年/年平均/月平均/季平均）
  - `← needs: F-16, B-05`

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

- [x] `DONE` **F-20** `[M]` 区域统计模块 kg→mm 换算

- [x] `DONE` **F-21** `[S]` 区域边界视觉清晰度改善（Enhancement）
  - "聚光灯"方案：反向遮罩 + dimmed/lineVisible feature-state + fitBounds 自动居中
  - 见 `docs/design/frontend.md` F-21 节
  - `← needs: F-14`

- [ ] `BLOCKED` **F-22** `[M]` 格点图层等值线叠加（Feature，优先级最高）
  - 依赖 `d3-contour`；8 条等值线按 vmin/vmax 均分；4 种线型循环（细虚→粗虚→细实→粗实）
  - 坐标变换：格点索引 → WGS-84；MapLibre geojson + line + symbol layer
  - 等值线数值标注（toPrecision(4)，大数科学计数，不显示单位）
  - 图例面板底部独立开关按钮；帧切换/kg↔mm 时自动重算
  - `← needs: F-10`
  - ← **BLOCKED**：平滑性/映射偏差（BUG-18）未解决；标注需 deck.gl，与 F-23 捆绑决策；代码归档于 `archive/F-22-contour-v1`，见 backlog

- [ ] `BLOCKED` **F-23** `[M]` 格点图层高低点标注（Feature，优先级次之）
  - 8-邻域比较法查局部极值；top-3 极大值（H，暖色）+ top-3 极小值（L，冷色）
  - MapLibre symbol layer；数值格式同等值线
  - 图例面板底部独立开关按钮；`← needs: F-10`
  - ← **BLOCKED**：渲染方案（deck.gl TextLayer + CollisionFilterExtension）与 F-22 标注耦合，一并决策后实现

- [ ] `BLOCKED` **F-24** `[S]` 格点图层数值标注（Feature，低优先级）
  - 格点中心显示数值；zoom ≥ 6 时渲染；text-allow-overlap: false
  - MapLibre symbol layer；`← needs: F-10`
  - `RegionMeta` 类型增加 `area_m2?: number`，从 `/meta/regions` 响应读取
  - 复用 `isKgToMm` ref（`useGridLayer.ts` 导出）；区域切换时**不重置**
  - `RegionModule.vue`：`currentValue` 展示时按 `value / area_m2` 换算，Inspector `unit` prop 动态为 `mm` 或 `kg`
  - `RegionHistoryModal.vue`：折线数据取值后 `/ area_m2`；Y 轴单位标注同步；标题栏追加 `kg→mm / mm→kg` 按钮（与 HistoryModal 格点模式样式一致）
  - `area_m2` 为 `null` 时：Legend 单位切换按钮不显示，降级为纯 kg 展示
  - `← needs: B-05, F-16`
  - ← **BLOCKED**：随 F-22/F-23 一并推迟，见 backlog

- [x] `DONE` **F-30** `[M]` 界面字号与尺寸缩放设置（Enhancement）
  - 用户反馈：默认字号偏小，在大屏/投影场景下不易阅读
  - **前置清理**：将所有组件内硬编码的 `px` 字号改为 `em`，覆盖文件：
    - `CategoryFlyout.vue`：8 处（10px/11px/12px）
    - `BottomBar.vue`：2 处（9px/10px）
    - `RegionModule.vue`、`PlaceholderModule.vue`：各少量
  - **根字号改法**：`global.css` 中 `html { font-size: 16px }` → `font-size: 100%`，不写绝对像素
  - **缩放实现**：SettingsPanel 新增"界面大小"选项（radio），3 档：
    - 正常（`font-size: 100%`，浏览器默认 16px）
    - 大（`font-size: 112.5%`，约 18px）
    - 更大（`font-size: 125%`，约 20px）
  - 选中后动态设置 `document.documentElement.style.fontSize`，持久化至 localStorage（key：`cwrvis:font-size`）
  - 因布局尺寸（`--h-nav` 等）已是 rem，组件高度自动跟随缩放；下拉菜单固定 `px` 宽度（`min-width: 180px` 等）需同步改为 `em`
  - `← needs: F-18（SettingsPanel 已有）`

- [x] `DONE` **F-31** `[M]` 变量显示名称重命名——临时展示层映射（Enhancement，见 DEC-018）
  - **背景**：甲方要求对齐新命名规范，但上游数据文件暂时无法同步变更，采用临时展示层映射方案
  - **核心改动**：`VarMeta` 新增 `display_name` 字段；前端所有用户可见处改用 `display_name`；数据访问层不变
  - **涉及文件**（10 处）：
    - `frontend/src/types/index.ts`：`VarGroupId` 更新、`VarMeta` 新增 `display_name`
    - `frontend/src/config/vars.ts`：全部15变量补 `display_name`、更新 `long_name`、重写 `VAR_GROUPS`（5新组）
    - `frontend/src/components/layout/LeftRail.vue`：ICONS key 对应新 VarGroupId，图标语义重映射
    - `frontend/src/components/layout/SubToolbar.vue`：`name` → `display_name`
    - `frontend/src/components/layout/CategoryFlyout.vue`：`name` → `display_name`
    - `frontend/src/components/panels/Legend.vue`：`name` → `display_name`
    - `frontend/src/components/modules/GridModule.vue` + `RegionModule.vue`：传给 Inspector 的 var-name prop
    - `frontend/src/components/modals/RegionHistoryModal.vue`：legend formatter、tooltip、chips、picker、表格 key 列、CSV 列头
    - `frontend/src/components/modals/HistoryModal.vue`：legend formatter、tooltip
  - **注意**：chart series name 保留旧 key（用于 VARS 元数据反向查找），仅在 legend formatter / tooltip 渲染时替换为 `display_name`
  - **后续**：全链路迁移完成后，删除 `display_name` 字段，见 backlog F-32/F-33

- [x] `DONE` **F-34** `[S]` 空间分布模块固定显示西藏自治区边界线（Enhancement）
  - **背景**：空间分布地图目前无任何行政边界参考，加上全区外轮廓 + 7 个地市内部分界线，方便识别格点数据的空间位置
  - **数据来源**：复用 `/shapes/` 静态端点（`xizang.geojson` + `lasa/rikaze/shannan/linzhi/changdu/naqu/ali.geojson`），GCJ-02 → WGS-84 坐标偏移逻辑与 `useRegionLayer` 一致
  - **实现方案**：新建 `useXizangBoundary.ts` composable（模块级单例，init/show/hide 与 `useRegionLayer` 同模式）；`GridModule.vue` 调用一行即可
  - **4 个 MapLibre 图层**（按渲染顺序从下到上）：
    - `xizang-prefecture-halo`：地市分界光晕 `rgba(0,0,0,0.4)` 1.5px
    - `xizang-prefecture-line`：地市分界白线 `rgba(255,255,255,0.5)` 0.75px
    - `xizang-outer-halo`：外轮廓光晕 `rgba(0,0,0,0.5)` 2.5px
    - `xizang-outer-line`：外轮廓白线 `rgba(255,255,255,0.85)` 1.5px
  - **验收**：打开"空间分布"模块，地图上始终可见西藏全区外轮廓（白色+黑色光晕）及 7 条地市内部分界线；切换到其他模块后边界线消失

- [x] `DONE` **F-35** `[S]` 帮助弹窗——云水资源数据说明文档（Feature）
  - **背景**：导航栏右上角"帮助"按钮目前无动作，需接入数据说明文档，方便用户理解各变量物理含义
  - **实现方案**：
    - 新建 `HelpModal.vue`，内容硬编码为 HTML（不依赖 docx 运行时解析）
    - 数学符号用 `<i>` + `<sub>` 表示（原 WMF 图片不兼容浏览器）
    - `ProductNav.vue` 帮助按钮触发 `open-help` 事件，`App.vue` 控制显示
  - **弹窗布局**（桌面端居中）：
    - 固定头部：文档标题 + ✕
    - 可滚动正文：摘要 → 数据说明 → 变量说明表（3列）→ 参考文献
    - 固定脚部：联系邮箱 `share@byweather.cn`
    - `max-width: 760px`，`max-height: 85vh`，半透明遮罩背景
    - 点击遮罩 / Esc 关闭
  - **验收**：点击帮助按钮弹出弹窗，内容与原文一致，表格正常显示，邮箱在底部，可滚动，Esc/遮罩可关闭
  - **内容规格**：见 `docs/design/help-content.md`

---

## D — Deploy / 部署与运维

- [x] `DONE` **D-01** `[M]` 分发包结构与打包脚本
  - 目录：`cwrvis-{version}/bin/`、`app/`、`static/{grid,web,shapes,reports}/`、`db/`、`conf/`、`logs/`
  - **离线部署**：`make package` 在打包时以 `uv pip download --platform manylinux_2_17_x86_64` 预取 Linux wheel 缓存，嵌入 `app/wheels/` + `app/requirements.txt`；支持在 macOS 构建、Linux 离线运行
  - `bin/start.sh`：首次启动自动建 venv——有 `wheels/` 则离线安装，否则在线 fallback；后续启动直接复用已有 venv
  - `bin/stop.sh`：读 PID 文件 graceful stop
  - `conf/config.env.example`：环境变量模板，打包时复制到 `conf/config.env`
  - 打包通过根目录 `Makefile` 的 `make package` target 完成（前置：`make setup`）
  - `← needs: S-03, S-04, S-05, B-01~B-04, F-01~F-19`

- [x] `DONE` **D-02** `[S]` systemd service 配置
  - `deploy/systemd/cwrvis.service`：`WorkingDirectory`、`ExecStart`（绝对路径 `bin/start.sh`）、`Restart=on-failure`、`RestartSec=5`
  - `← needs: D-01`

- [x] `DONE` **D-03** `[S]` 网络配置说明（`docs/design/deployment.md` 更新）
  - 直连方案：uvicorn 直接监听 0.0.0.0:8000，无 Nginx
  - 可选 Nginx 反代：upstream 配置模板，静态文件 `/grid/` 走 Nginx 直出
  - HTTPS：Let's Encrypt certbot 配置示例
  - `← needs: D-01`（配置编写不依赖，但测试依赖 D-01）

---

## 进度统计

| 模块 | 总计 | ✅ DONE | 🔄 IN_PROGRESS | 📋 TODO | 🚫 BLOCKED |
|------|:----:|:-------:|:--------------:|:-------:|:----------:|
| S 脚本 | 6 | 6 | 0 | 0 | 0 |
| B 后端 | 7 | 7 | 0 | 0 | 0 |
| F 前端 | 29 | 25 | 0 | 1 | 3 |
| D 部署 | 3 | 3 | 0 | 0 | 0 |
| **合计** | **45** | **41** | **0** | **1** | **3** |

> F BLOCKED 3 = F-22 / F-23 / F-24（格点等值线、高低点标注、数值标注；依赖技术方案决策）

**预估剩余工时**（单人）：F-22~F-24（等值线/标注）待技术决策后评估；其余用户反馈迭代已全部完成
