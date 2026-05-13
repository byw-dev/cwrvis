# Phase 1 — MVP 任务清单

**目标**：完成可演示、满足验收的最小可用版本
**时间**：第一阶段
**验收标准**：见 `CLAUDE.md` → "第一阶段验收标准"

---

## S — Scripts / 数据预生成脚本

- [x] `DONE` **S-01** netcdf_to_json.py：生成 5 种颗粒度格点 JSON
  - year/{var}.json（26 帧）、month/{var}.json（312 帧）
  - mean_all/{var}.json（1 帧）、mean_month/{var}.json（12 帧）、mean_season/{var}.json（4 帧）
  - 含 meta.json（网格坐标、dxy、时间轴、var 元数据）
  - 支持 kg→mm 换算辅助变量 dxy 导出

- [ ] `TODO` **S-02** netcdf_to_sqlite.py：生成区域统计 SQLite
  - 对每个 region × granularity × var 计算区域统计值写入 region_stats 表
  - `BLOCKED` ← 等待甲方提供 netcdf 原始数据 + 确认区域 shape 坐标系

- [ ] `TODO` **S-03** shapes 文件处理：中文文件名 → region_id 命名
  - 将 `data/shapes/西藏自治区.geojson` 等复制为 `static/shapes/xizang.geojson` 等
  - 可做成 Makefile 规则或独立 shell 脚本，集成到打包流程

---

## B — Backend / 后端 API

- [ ] `TODO` **B-01** FastAPI 入口（`backend/main.py`）完善
  - 挂载路由：stats / report / meta
  - StaticFiles 挂载：`/grid` → grid_dir、`/shapes` → shapes_dir、`/` → 前端 build 产物
  - CORS 配置（开发阶段）

- [ ] `TODO` **B-02** `/api/v1/stats` 接口（`routers/stats.py`）
  - 参数校验：region_id、granularity（year/month）、year_start/end（2000–2025）、var（可多值）
  - SQLite 查询，返回统一响应结构
  - 错误处理：region_id 不存在 → 404，参数非法 → 400

- [ ] `TODO` **B-03** `/api/v1/report/download` 接口（`routers/report.py`）
  - 按命名规则拼接文件路径，检查存在性，返回文件流
  - 404 时返回 JSON 错误体

- [ ] `TODO` **B-04** `/api/v1/meta/regions` 接口（`routers/meta.py`）
  - 从 config.py 中的 REGION_MAP 硬编码返回区域列表（id、name、level）
  - 无数据库查询

---

## F — Frontend / 前端

### 基础设施

- [ ] `TODO` **F-01** 项目初始化
  - Vue 3 + TypeScript + Vite（pnpm，corepack 管理）
  - 依赖：MapLibre GL JS ≥4.0、ECharts ≥5.5、Pinia ≥2.0
  - `types/index.ts`：VarName、RegionId、AggMode、FrameSel、BasemapId 等公共类型
  - `tsconfig.json` 严格模式，确保 `pnpm tsc --noEmit` 可通过

- [ ] `TODO` **F-02** 全局样式与设计系统
  - CSS 变量（`--bg-*`、`--fg-*`、`--accent`、`--font-ui/mono`、`--h-nav/sub/bottom`、`--w-rail`）
  - 基础 reset，MapLibre 样式覆盖，自定义滚动条

- [ ] `TODO` **F-03** Pinia stores 骨架
  - `stores/time.ts`：AggMode + FrameSel + playing
  - `stores/var.ts`：selVar
  - `stores/region.ts`：selRegionId + regions + statsCache
  - `stores/meta.ts`：GridMeta（从 /grid/meta.json 加载）
  - `stores/settings.ts`：localStorage 持久化，SCHEMA.md 中定义的所有 key
  - `config/vars.ts`：15 个 var 的元数据与色卡控制点
  - `config/basemaps.ts`：4 种底图配置
  - `config/constants.ts`：YEAR_MIN/MAX、SEASONS 定义

### 布局 Chrome

- [ ] `TODO` **F-04** ProductNav 组件
  - 7 个 Tab（含激活态 accent 底线）
  - 右端：帮助占位 + ⚙ 入口 + 用户标识
  - 品牌标识（五边形 SVG + 文字）
  - 切换 Tab 时渲染对应模块

- [ ] `TODO` **F-05** LeftRail + CategoryFlyout 组件
  - 5 个变量分组图标（自绘 SVG）+ 搜索 + 导出（占位）
  - 点击 → 飞出 260px 面板，含搜索框 + 变量列表
  - 当前选中变量所属分组图标激活态
  - 仅在 grid / region 模块显示

- [ ] `TODO` **F-06** SubToolbar 组件（三种模式）
  - 格点数据：变量选择器下拉（VarDropdown）+ 聚合模式两组按钮 + 模式参数动态区域
  - 区域统计：继承格点数据，追加区域选择器（RegionPicker）
  - 数据导出：区域选择器 + 年份下拉

- [ ] `TODO` **F-07** BottomBar 时间轴组件
  - 5 种聚合模式各自的帧序列生成逻辑
  - 播放/暂停（setInterval 驱动，不用 rAF）
  - 速度控制（0.5×/1×/2×/4×），按模式持久化到 localStorage
  - 刻度轨道（major/minor tick，当前帧游标）
  - 键盘快捷键：← → Space
  - 年平均（1 帧）时隐藏播放控件，显示静态提示

### 地图与格点渲染

- [ ] `TODO` **F-08** MapView 组件（MapLibre 初始化）
  - `composables/useMap.ts`：地图实例管理、底图切换（updateSource）
  - 初始视野：西藏区域（lon 75–100, lat 25–40），zoom ~5
  - 响应 settings.basemap 变化实时切换底图

- [ ] `TODO` **F-09** Web Worker（`workers/gridRenderer.worker.ts`）
  - 接收：`frame2d: (number|null)[][]`、colormap、threshMin/Max、targetW/H
  - 双线性插值（15×25 → 600×400）
  - 256-LUT 色卡映射 + 阈值过滤
  - 返回：`ImageBitmap`（Transferable）

- [ ] `TODO` **F-10** useGridLayer composable
  - fetch `/grid/{gran}/{var}.json`，解析，按帧索引提取二维数组
  - 调用 Worker 渲染，收到 ImageBitmap 后更新 MapLibre ImageSource
  - 帧缓存（LRU 20 帧），预加载 ±2 帧
  - 响应 selVar / mode / sel / colormap 变化自动更新

### 格点数据模块

- [ ] `TODO` **F-11** GridModule 容器 + 地图交互
  - `HoverTooltip.vue`：跟随鼠标 tooltip，显示插值数值（pointer-events: none）
  - `PinTip.vue`：取值点气泡，绑定地图投影坐标，随帧更新数值，[查看历史] 入口
  - 十字光标标记（MapLibre Marker 或自定义 DOM）
  - Escape 清除取值点

- [ ] `TODO` **F-12** Legend + Inspector 面板（Right Stack）
  - `Legend.vue`：色标条（canvas 渲染）+ MIN/MEAN/MAX + Colormap 选择器（5 个，按 var 持久化）
  - `Inspector.vue`：格点模式（坐标/时间/数值/分位条）；区域模式（区域名/时间/数值）
  - 面板位置（左/右）响应 settings.legendPosition

- [ ] `TODO` **F-13** HistoryModal（格点数据模式）
  - 4 个 Tab：逐月 / 逐年 / 多年月均 / 多年季均
  - 数据来源：从已加载的格点 JSON 对 picked 点做双线性插值（纯前端计算）
  - ECharts 折线图：当前帧橙色竖线高亮，悬停 tooltip，点击跳帧（关闭 Modal）
  - 统计卡片：帧数 / MIN / MEAN / MAX / 极值时刻

### 区域统计模块

- [ ] `TODO` **F-14** useRegionLayer composable
  - 加载 `/shapes/{region_id}.geojson`（按坐标系修正，见 frontend.md）
  - MapLibre FillLayer + LineLayer（西藏轮廓 / 地市边界 / 悬停 / 选中四个状态）
  - hover feature-state 驱动悬停高亮
  - 响应 selRegionId 更新选中高亮

- [ ] `TODO` **F-15** RegionModule 容器 + 区域交互
  - 地图点击事件 → 判断命中地市 → 更新 selRegionId → 联动 SubToolbar 区域选择器
  - 悬停 tooltip：地市名 + 当前统计数值（从 statsCache 读取）
  - 进入模块时加载当前 region + var 的 year & month 全量 stats 数据

- [ ] `TODO` **F-16** HistoryModal（区域统计模式）
  - 数据来源：`/api/v1/stats`（后端 SQLite）
  - 4 个 Tab：逐月 / 逐年 / 月平均（客户端计算）/ 季平均（客户端计算）
  - ECharts 折线图，多变量叠加：默认当前 var，可追加其他 var（各自发请求后追加折线）
  - 多 Y 轴：同单位共轴，不同单位右侧增轴
  - 当前帧橙色竖线，点击跳帧

### 其余模块

- [ ] `TODO` **F-17** ExportModule（数据导出）
  - 区域选择器 + 年份下拉（全部/2000–2025）
  - 点击下载 → `GET /api/v1/report/download?...` → 浏览器触发下载
  - 404 时页面内错误提示

- [ ] `TODO` **F-18** SettingsPanel（用户设置）
  - overlay 面板（ProductNav ⚙ 打开）
  - 底图选择（4 个 radio）
  - 图例位置（左/右 radio）
  - "恢复默认值"按钮（清除所有 `cwrvis:` localStorage key → reload）

- [ ] `TODO` **F-19** PlaceholderModule（占位模块）
  - 总览 / 时序分析 / 站点观测 / 模式诊断 共用同一个占位组件
  - 显示模块名 + "该模块正在建设中"

---

## D — Deploy / 部署与运维

- [ ] `TODO` **D-01** 分发包目录结构与打包脚本
  - 定义 `cwrvis-{version}/` 结构（bin/、app/、static/、db/、conf/、logs/）
  - `bin/start.sh`：启动 uvicorn，读取 conf/config.env
  - `bin/stop.sh`：graceful stop
  - 打包脚本：前端 build → dist/ 复制到 static/web/；shapes 重命名

- [ ] `TODO` **D-02** systemd service 配置更新
  - `deploy/systemd/cwrvis.service`：WorkingDirectory、ExecStart、Restart 策略

- [ ] `TODO` **D-03** Nginx 配置（可选，用于反代或纯静态 + 代理分离）
  - 配置模板，记录在 deployment.md

---

## 统计

| 模块 | 总计 | DONE | IN_PROGRESS | TODO | BLOCKED |
|------|------|------|-------------|------|---------|
| S（脚本） | 3 | 1 | 0 | 1 | 1 |
| B（后端） | 4 | 0 | 0 | 4 | 0 |
| F（前端） | 19 | 0 | 0 | 19 | 0 |
| D（部署） | 3 | 0 | 0 | 3 | 0 |
| **合计** | **29** | **1** | **0** | **27** | **1** |
