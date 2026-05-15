# DECISIONS — 技术决策记录

> 记录项目中所有重要的技术决策。  
> 决策一旦落地即为不可变记录；若推翻，新建条目并标注"Supersedes DEC-NNN"。  
> 格式：背景 → 决策 → 原因 → 代价/权衡。

---

## 数据架构

### DEC-001：格点数据以 JSON 静态文件分发，不提供实时 API

**状态**：Active  
**决策**：netcdf 数据离线预生成为 JSON 文件（`/static/grid/`），由 FastAPI StaticFiles 托管，前端直接 fetch。  
**背景**：原始 netcdf 解析需要 xarray/numpy，不适合在 Web 服务器运行时执行。  
**原因**：
- 零运行时计算压力，服务器只做静态文件服务
- HTTP 缓存天然生效，同一帧重复访问无网络开销
- 部署极简，无需额外数据服务进程

**代价**：数据更新需重跑预生成脚本（第一阶段数据静态，可接受）；磁盘占用约 800MB（可接受）。

---

### DEC-002：区域统计使用 SQLite，不使用 PostgreSQL

**状态**：Active  
**决策**：区域统计预计算结果存入 SQLite（`db/stats.db`），FastAPI 直接用 `sqlite3` 读取。  
**背景**：区域统计数据量约 16 万行，只读访问为主，无并发写入。  
**原因**：无需独立数据库服务进程；SQLite 文件可随分发包一起交付；运维零额外成本。  
**代价**：不适合高并发写入场景（当前无此需求）；迁移到 PostgreSQL 时需重写 database.py。

---

### DEC-003：报告文件预生成，运行时只提供下载

**状态**：Active  
**决策**：`.docx` 报告由数据团队离线生成，后端按命名规则（`{region_id}_{granularity}_{start}_{end}.docx`）拼接路径后返回文件流。  
**背景**：动态生成 Word 文档需要图表渲染，实现成本高，且当前报告组合数量有限。  
**原因**：完全消除后端 Word 生成复杂性；运维只需替换文件。  
**代价**：报告内容无法动态定制；命名规则变更需同步更新后端和前端。

---

## 地图与坐标

### DEC-004：底图可切换，默认 OpenStreetMap

**状态**：Active（Supersedes 原 ADR-004"固定使用高德"）  
**决策**：底图 provider 通过 `config/basemaps.ts` 集中配置，支持 OSM / 高德街道 / 高德卫星 / Carto Dark 四种，默认 OSM；用户可在设置面板切换并持久化到 localStorage。  
**背景**：高德 API Key 申请尚未完成；演示环境需要随时可用的底图。  
**原因**：
- OSM 开箱即用，无 Key、无配额限制，降低部署门槛
- 切换成本极低：一个配置文件覆盖所有底图差异（tiles URL、坐标系标记）
- 坐标系差异通过 `coordSys: 'wgs84' | 'gcj02'` 标记统一处理，对上层透明

**代价**：OSM 暗色风格不如高德美观；若甲方要求强制高德，需申请 Key 并改默认值。

---

### DEC-005：GCJ-02 偏移采用整体边界框修正，不做逐点转换

**状态**：Active  
**决策**：格点 ImageSource 的四角坐标统一偏移（+0.01° lon, −0.005° lat）；区域 GeoJSON 在 WGS-84 底图下同样整体偏移，不对每个点做精确 WGS-84↔GCJ-02 转换。  
**背景**：格点空间分辨率 1°（约 100km），GCJ-02 偏移约 500m，两个量级差距悬殊。  
**原因**：逐点转换性能差且收益为零；整体偏移在视觉上完全不可见。  
**代价**：在边缘格点处存在亚像素级误差（可接受）。

---

## 前端技术栈

### DEC-006：前端全量使用 TypeScript

**状态**：Active  
**决策**：所有前端源文件为 `.ts` 或 `<script setup lang="ts">` 的 `.vue`，`tsconfig.json` 启用严格模式，构建前必须通过 `pnpm tsc --noEmit`。  
**背景**：项目涉及多种复杂数据类型（VarMeta、FrameSel、AggMode、RegionStatsData 等），运行时类型错误难以调试。  
**原因**：在格点渲染、时间轴、区域统计等状态流转中提供编译期保障；减少跨组件数据传递的隐式错误。  
**代价**：初期设置成本略高；第三方库若无类型定义需手写 `.d.ts`。

---

### DEC-007：使用 ECharts 渲染所有图表（放弃自绘 Canvas）

**状态**：Active  
**决策**：HistoryModal（格点模式）、HistoryModal（区域统计模式）均使用 ECharts 折线图，不采用设计原型中的自绘 Canvas 方案。  
**背景**：设计原型使用 Canvas 手绘折线图；区域统计历史需要支持多变量叠加、多 Y 轴等复杂交互。  
**原因**：
- ECharts 开箱支持多系列、多 Y 轴、tooltip、点击事件，自绘实现成本数倍于此
- 视觉风格可通过 ECharts 主题配置与设计系统保持一致（深色背景、cyan 高亮）
- 两种 HistoryModal 共用同一图表组件接口，降低维护成本

**代价**：ECharts 包体积约 1MB（tree-shaking 后约 300KB）；与设计原型视觉存在细微差异（可接受）。

---

### DEC-008：pnpm + corepack 管理前端依赖

**状态**：Active  
**决策**：前端使用 pnpm，版本固化于 `frontend/package.json` 的 `packageManager` 字段；通过 Node.js 内置 corepack 自动匹配版本。禁止直接使用 npm 或全局 pnpm。  
**原因**：保证所有开发者和 CI 使用相同 pnpm 版本；pnpm 的 symlink node_modules 结构避免幽灵依赖。  
**代价**：需执行一次 `corepack enable`（仅首次）。

---

### DEC-009：uv 管理 Python 依赖，禁止直接使用 pip

**状态**：Active  
**决策**：所有 Python 脚本执行和依赖安装通过 `uv run` / `uv pip install` 完成，使用项目 `.venv` 隔离，严禁操作系统 Python 环境。  
**原因**：避免污染系统 Python；uv 速度极快，解析依赖 < 1s；`.venv` 保证可复现。  
**代价**：开发者需要安装 uv（一次性）。

---

### DEC-010：setInterval 驱动时间轴播放，不使用 requestAnimationFrame

**状态**：Active  
**决策**：时间轴播放循环使用 `setInterval`，播放间隔 `Math.max(80, 300 / speed)` ms。  
**背景**：rAF 在标签页不可见或失焦时会被浏览器节流/暂停，导致播放进度错乱。  
**原因**：setInterval 在后台标签页继续触发，保证播放进度准确；单帧渲染约 10–30ms，setInterval 足够流畅。  
**代价**：setInterval 存在毫秒级漂移（对气候数据可视化完全可接受）。

---

### DEC-011：用户设置持久化到 localStorage，不引入鉴权

**状态**：Active  
**决策**：底图类型、图例位置、各 var 的 colormap、各聚合模式的播放速度，全部以 `cwrvis:` 前缀存入 localStorage；无服务端用户系统。  
**背景**：系统无用户登录需求（内部科研工具）。  
**原因**：实现极简；设置跟随浏览器，重置功能（清除所有 `cwrvis:` key）易于实现。  
**代价**：设置不跨浏览器/设备同步（当前无此需求）；localStorage 上限 5–10MB（当前存储量极小）。

---

### DEC-012：区域统计聚合模式（年平均/月平均/季平均）在前端计算

**状态**：Superseded by DEC-013  
**决策**：~~区域统计的统计类聚合通过前端从已加载的逐年/逐月原始数据计算~~（已废弃）  

---

### DEC-013：SQLite 宽表 schema，后端 SQL 承担全部时间聚合

**状态**：Active（Supersedes DEC-012）  
**决策**：
1. `region_stats` 表改为宽表，15 个 var 各占一列，不再有 `var`/`value` 两列；表中只存储 `year` / `month` 两种 granularity 的原始值。
2. 后端 `/api/v1/stats` 扩展支持 5 种 granularity（`year` / `month` / `mean_all` / `mean_month` / `mean_season`），后三种通过 SQL `AVG` + `GROUP BY` 在查询时实时计算。
3. 接口不再接受 `var` 过滤参数，每次请求返回全部 15 个 var 的数据。

**背景**：DEC-012 让脚本只生成 year/month 原始数据，但三种聚合模式交由前端客户端计算，导致"统计口径"的可替换性无法从脚本延伸到聚合层，且架构上破坏了"预计算优先"原则。  
**原因**：
- 统计口径完全由脚本和 SQL 决定，前端无计算逻辑，口径一致性有保障
- SQLite 宽表对 `AVG`/`GROUP BY` 的性能远超需求（< 1ms）
- 取消 `var` 过滤简化了 API，单次请求即可获取所有变量
- 宽表行数大幅减少（2,704 行，原设计约 40,560 行）

**代价**：SQLite schema 中 var 列名硬编码；新增变量需 schema migration；`mean_all` / `mean_month` / `mean_season` 的计算在查询时完成而非预存（数据量极小，可接受）。

---

### DEC-014：空间聚合算法通过 Strategy Pattern 可替换

**状态**：Active  
**决策**：`scripts/netcdf_to_sqlite.py` 中的"格点×区域"空间聚合逻辑抽象为 `RegionAggregator` ABC，提供两个实现，通过 `--method` CLI 参数选择。开发阶段可对比两种方法的输出；部署时只保留一种。

| 实现类 | CLI 值 | 空间逻辑 | 聚合算子 |
|--------|--------|---------|---------|
| `AreaWeightedMean` | `area_weighted` | 计算格点与区域多边形的面积重叠权重（geopandas） | 加权平均（所有 var） |
| `PointInBoundary` | `point_in_boundary` | 仅取中心点落在边界内的格点（shapely）| SUM（单位 kg）/ 算术平均（单位 % / day / hour） |

`prepare(region_geom, grid_lats, grid_lons)` 每个区域调用一次（缓存权重/掩码），`aggregate(frame_2d, var_unit)` 每帧调用。  
**背景**：不同科学问题对"区域代表值"的定义不同（总量 vs. 平均态）；算法可替换性是开发阶段的明确需求。  
**原因**：Strategy Pattern 将算法与流程解耦，切换方法无需修改主流程代码。  
**代价**：OOP 结构增加少量代码量；`PointInBoundary` 的 SUM/MEAN 分派逻辑依赖 var 单位（当前数据集 var 单位固定，可接受）。

---

## 格点渲染

### DEC-015：Web Worker + OffscreenCanvas 渲染格点图层

**状态**：Active  
**决策**：格点双线性插值、色卡映射、阈值过滤全部在 Web Worker 中执行，通过 OffscreenCanvas 生成 ImageBitmap，以 Transferable 方式返回主线程，挂载为 MapLibre ImageSource。  
**背景**：15×25=375 格点的双线性插值到 600×400 像素约需 10–50ms，在主线程执行会阻塞 UI。  
**原因**：Worker 与主线程并行；ImageBitmap Transferable 零拷贝；MapLibre ImageSource 原地替换无闪烁。  
**代价**：Worker 无法访问 DOM；Worker 初始化有一次性开销（<5ms）。

---

## 部署与运维

### DEC-016：构建时写入版本信息，后端接口暴露，设置面板展示

**状态**：Active  
**决策**：
1. `scripts/gen_build_info.sh` 在 `make package` 和 `make dev` 时执行，将 git 状态写入 `backend/build_info.json`（生成文件，不入版本库）
2. 版本字符串规则：无未提交改动 → `{VERSION}-{short_commit}`；有改动 → `{VERSION}-{short_commit}-dev`
3. 后端在 `GET /api/v1/version` 接口读取并返回该文件；文件缺失时返回默认 `"dev"` 值
4. 前端在设置面板底部展示版本字符串和构建时间

**背景**：MVP 阶段无 git tag，需要在不引入 SemVer 管理成本的前提下实现版本可追溯。  
**原因**：
- 构建时（非运行时）确定版本信息：前后端拿到同一份数据，无竞态
- `make dev` 同样生成，确保开发态与生产态行为一致
- 生产服务器不需要安装 git（文件由构建机生成后打入包中）
- 独立 `/api/v1/version` 接口：不污染 `/health`（health check 应保持轻量）

**代价**：每次 `make dev` 写一次磁盘（可忽略）；版本号仍需手动 bump（未来采用 git tag + `git describe` 后可自动化）。

**未来演进路径**：采用 git tag 后，`gen_build_info.sh` 改用 `git describe --tags --always --dirty` 自动推导版本，`VERSION` Makefile 变量变为可选覆盖。

---

## MVP 区域数据

### DEC-017：MVP 阶段区域 ID 与父子关系全部硬编码

**状态**：Active（已知技术债，待未来迭代解决）

**决策**：Phase 1 中所有区域相关代码均以字面量或常量硬编码 8 个区域 ID（`xizang` + 7 地市），以及 xizang 与地市之间的父子关系（xizang 是所有地市的"全区"父级）。不引入动态区域配置或层级数据模型。

**背景**：MVP 范围明确——仅西藏自治区一省八市，甲方短期内不要求扩展到其他省份或更细的区域层级（县、乡）。快速交付优先于可扩展性。

**原因**：
- 硬编码消除了运行时配置加载的复杂度
- 区域 GeoJSON、SQLite 统计表、前端图层逻辑均已与 8 个固定 ID 对齐，统一修改成本低
- 甲方未明确提出多省/多层级需求，过早抽象引入无谓复杂度

**代价（重构时需同步修改的位置）**：

| 位置 | 硬编码内容 |
|------|-----------|
| `frontend/src/composables/useRegionLayer.ts` | `DISTRICT_IDS` 常量、`buildAllGeo` ID 列表、`buildMaskGeo` 假设 xizang 为外边界、`onMapClick` 中 xizang 不可点击、`applySelection` xizang 特判 |
| `frontend/src/composables/useRegionLayer.ts` | `regionName()` 中 xizang 显示名称硬编码 |
| `frontend/src/types/index.ts` | `RegionId` 类型为字面量联合类型 |
| `backend/config.py` | `REGION_MAP` 字典，区域 ID → 中文名 |
| `scripts/netcdf_to_sqlite.py` / `csv_to_sqlite.py` | 区域 ID 从 shape 文件名推断，无层级概念 |

**触发条件**：一旦需要支持多省、县级区域或动态区域配置，须先设计区域层级数据模型（建议参考 `region_id` + `parent_id` + `level` 的树形结构），再系统性替换上述所有位置。见 `docs/tasks/backlog.md`。
