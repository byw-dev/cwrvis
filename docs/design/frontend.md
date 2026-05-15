# 前端架构与渲染方案设计 — cwrvis

> 文档版本：v2.0（UI 设计稿对齐）
> 对应模块：`frontend/`

---

## 开发环境约束（强制）

| 工具 | 版本 | 管理方式 |
|------|------|----------|
| Node.js | v24.15.0（Krypton） | nvm，版本固化于项目根 `.nvmrc` |
| pnpm | 最新稳定版 | corepack，版本固化于 `frontend/package.json` 的 `packageManager` 字段 |
| TypeScript | ≥ 5.4 | 全量 TypeScript，源文件全部为 `.ts` / `.vue`（`<script setup lang="ts">`），无裸 `.js` |

```bash
nvm use
corepack enable   # 首次一次性
pnpm install
pnpm tsc --noEmit # 构建前必须通过类型检查
```

**禁止**直接使用 `npm` 或全局安装的 `pnpm` 绕过 corepack。

---

## 技术栈

| 技术 | 版本要求 | 用途 |
|------|----------|------|
| Vue 3 | ≥ 3.4 | 前端框架（Composition API，`<script setup lang="ts">`） |
| TypeScript | ≥ 5.4 | 全量类型约束 |
| Vite | ≥ 6.0 | 构建工具 |
| MapLibre GL JS | ≥ 4.0 | 地图渲染引擎 |
| ECharts | ≥ 5.5 | 历史数据图表、区域统计图表 |
| Pinia | ≥ 2.0 | 全局状态管理 |

UI 组件库：不引入，CSS 完全手写（见「设计系统」节）。

---

## 设计系统

### CSS 变量

```css
:root {
  /* 背景层次（深→浅）*/
  --bg-0: #07090c;               /* 最深，窗口/遮罩背景 */
  --bg-1: #0d1117;               /* 面板主体 */
  --bg-2: #131a22;               /* 控件背景 */
  --bg-3: #1a232e;               /* 控件悬停 */

  /* 分割线层次 */
  --line-1: #1f2a37;
  --line-2: #2a3645;
  --line-3: #3b4a5e;

  /* 前景色 */
  --fg-0: #e8edf3;               /* 主文字 */
  --fg-1: #b6c2d2;               /* 次要文字 */
  --fg-2: #7a8699;               /* 辅助文字 */
  --fg-3: #54606f;               /* 标签/占位/弱信息 */

  /* 强调色 */
  --accent:       #58e0ff;       /* 主强调（选中态、激活态、数值） */
  --accent-dim:   #2e7d92;       /* 低调强调（边框、背景标记） */
  --accent-faint: rgba(88,224,255,0.07);  /* 极淡填充 */

  /* 语义色 */
  --warn: #ffba49;               /* 警告、当前帧高亮 */
  --good: #88e07a;               /* 正常状态指示 */

  /* 字体 */
  --font-ui:   'Inter', 'PingFang SC', 'Helvetica Neue', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', 'IBM Plex Mono', ui-monospace, Menlo, monospace;

  /* 布局尺寸 */
  --h-nav:    44px;              /* 顶部模块导航栏高度 */
  --h-sub:    44px;              /* 子工具栏高度 */
  --h-bottom: 86px;              /* 底部时间轴高度 */
  --w-rail:   56px;              /* 左侧图标轨道宽度 */
}
```

### 字体用途约定

| 字体变量 | 用途场景 |
|---------|---------|
| `--font-ui` | 所有 UI 文字（按钮标签、说明、菜单项） |
| `--font-mono` | 数值、坐标、变量 code、时间戳、帧序号、量程 |

### 视觉风格原则

科研仪表盘风格：深色背景 + cyan 强调色 + 硬边框（radius=0）。不使用 box-shadow 装饰、圆角、纯装饰性渐变、过场动画（仅允许必要的功能性过渡）。

---

## 页面整体布局

```
┌──────────────────────────────────────────────────────┐  ← ProductNav 44px（模块导航）
├──────────────────────────────────────────────────────┤  ← SubToolbar 44px（变量 + 聚合/区域）
│      │                                      │        │
│ Left │          Map Viewport                │ Right  │
│ Rail │    （底图 + 格点图层 + 交互叠加层）   │ Stack  │
│ 56px │                                      │ 260px  │
│      │                                      │        │
├──────────────────────────────────────────────────────┤  ← BottomBar 86px（时间轴）
└──────────────────────────────────────────────────────┘
```

| 区域 | fixed 位置 | 尺寸 | z-index |
|------|-----------|------|---------|
| ProductNav | 顶部 | 100% × 44px | 800 |
| SubToolbar | ProductNav 正下方 | 100% × 44px | 799 |
| LeftRail | 左侧，nav+sub 到 bottombar 之间 | 56px × auto | 700 |
| CategoryFlyout | LeftRail 右侧，按需展开 | 260px × auto | 700 |
| Map Viewport | 全屏，被上下左 overlay 盖住 | auto | 0 |
| Right Stack | 地图右侧浮动 | 260px × auto | 600 |
| BottomBar | 底部 | 100% × 86px | 800 |

---

## 模块导航（ProductNav）

顶部固定导航栏，分左中右三段：

```
[◆ 云水资源数据平台  CWR·DATA PLATFORM]  [01总览][02格点数据][03区域统计][04时序分析][05站点观测][06模式诊断][07数据导出]  [? ⚙ 研究员]
```

### Tab 列表

| 编号 | ID | 标签 | 第一阶段状态 |
|------|-----|------|------------|
| 01 | `overview` | 总览 | 占位（空白页） |
| 02 | `grid` | 格点数据 | **功能完整** |
| 03 | `region` | 区域统计 | **功能完整** |
| 04 | `series` | 时序分析 | 占位 |
| 05 | `station` | 站点观测 | 占位 |
| 06 | `model` | 模式诊断 | 占位 |
| 07 | `export` | 数据导出 | **功能完整** |

占位模块统一显示："该模块正在建设中"+ 模块名。

### 右端控件

- `?` — 帮助（占位）
- `⚙` — 打开用户设置面板（见「用户设置」节）
- 用户区 — 无鉴权，显示固定头像 + "研究员"文字

### 品牌标识

五边形 SVG 图标 + "云水资源数据平台" + 副标题 "CWR · DATA PLATFORM v0.x"（单色，`--accent` 色图标）。

---

## 子工具栏（SubToolbar）

固定在 ProductNav 下方，内容根据当前模块动态变化。

### 格点数据模块（`grid`）

```
[变量: CWR 云水资源量 [kg] ▾]  [原始: 逐年|逐月]  [统计: 年平均|月平均|季平均]  [← 模式参数 →]
```

**变量选择器**（最左侧）：
- 按钮显示当前选中：`CODE · 中文名 · [单位]`
- 点击 → 下拉面板（`VarDropdown`），按 5 个分组分段展示全部 15 个变量
- 每行：`CODE`（等宽）/ `long_name` / `[units]`

**聚合模式选择器**（中间，两组）：

```
┌──────┬──────┬──────┐   ┌──────────┬────────┬────────┐
│ 原始 │ 逐年 │ 逐月 │   │  统计    │ 年平均 │ 月平均 │ 季平均 │
└──────┴──────┴──────┘   └──────────┴────────┴────────┘
```

分组标签（"原始"/"统计"）为只读小字，区分两类模式的性质。

**模式参数**（右侧，随当前模式变化）：

| 模式 | 右侧显示内容 |
|------|------------|
| 逐月 | `YEAR 2018 · MONTH 07 · 312帧` |
| 逐年 | `YEAR 2018 · 26帧` |
| 年平均 | `RANGE 2000–2025 全期均值 · 1帧（静态）` |
| 月平均 | 月份下拉 `[01月 ▾]` · `12帧` |
| 季平均 | 季节 pill `[春][夏][秋][冬]` · `4帧` |

### 区域统计模块（`region`）

在格点数据 SubToolbar 的基础上，在聚合模式选择器右侧追加**区域选择器**：

```
[变量 ▾]  [原始: 逐年|逐月]  [统计: 年平均|月平均|季平均]  [区域: 西藏自治区（全区）▾]  [模式参数]
```

**区域选择器下拉**：

```
  ● 西藏自治区（全区）    ← 默认，仅可通过 UI 选择
  ─────────────────────
    拉萨市
    日喀则市
    山南市
    林芝市
    昌都市
    那曲市
    阿里地区
```

- 与地图点击**双向联动**：选择器变化 → 地图高亮更新；地图内点击地市 → 选择器更新
- 选中"西藏自治区（全区）"后，地图上无特定地市高亮，整个西藏外轮廓高亮

### 数据导出模块（`export`）

```
[区域: 西藏自治区（全区）▾]  [年份: 全部 ▾]       [⬇ 下载报告]
```

- 区域选择器：与区域统计模块相同组件
- 年份下拉：全部 / 2000 / 2001 / … / 2025

---

## 左侧变量轨道（LeftRail）

56px 宽纵向图标条，仅在格点数据（`grid`）和区域统计（`region`）模块中显示。

```
┌────────┐
│ LAYERS │  ← 小字标题
│─────────
│  ○     │  资源量  (2 vars)   ← 对应 CWR 分组
│  □     │  状态量  (4 vars)
│  →     │  通量    (4 vars)
│  ×     │  转化    (3 vars)
│  ⊙     │  更新期  (2 vars)
│        │  ← spacer
│  🔍    │  搜索（全部变量）
│  ↓     │  导出（占位）
└────────┘
```

### 变量分组定义

| 分组 ID | 标签 | 变量列表 |
|---------|------|---------|
| `cwr` | 资源量 | SP, CWR |
| `state` | 状态量 | aveMv, aveMh, GMv, GMh |
| `flux` | 通量 | INv, OTv, INh, OTh |
| `conv` | 转化 | MC, CEv, PEh |
| `renew` | 更新期 | RCv, RCh |

### 飞出面板（CategoryFlyout）

点击图标 → 从 LeftRail 右侧弹出 260px 宽面板：
- 面板头：分组名 / 变量数 / ✕ 关闭
- 搜索框：实时过滤 code 或 long_name
- 变量列表：每行 `code` / `long_name` / `units`，当前选中项左侧 2px accent 边框 + 淡青填充
- 点击某变量 → 选中并关闭飞出面板
- 当前选中变量所属分组的图标始终激活（即使飞出面板已关闭）

---

## 地图底图配置

### 底图 Provider（可切换）

默认使用 **OpenStreetMap**。底图列表在 `config/basemaps.ts` 中集中定义，切换逻辑在 `composables/useMap.ts` 中处理。

```typescript
// config/basemaps.ts
export type BasemapId = 'osm' | 'amap_street' | 'amap_satellite' | 'carto_dark';

export interface BasemapConfig {
  label: string;
  tiles: string[];          // MapLibre raster source tiles 数组
  attribution: string;
  maxZoom: number;
  coordSys: 'wgs84' | 'gcj02';
}

export const BASEMAPS: Record<BasemapId, BasemapConfig> = {
  osm: {
    label: 'OpenStreetMap',
    tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19,
    coordSys: 'wgs84',
  },
  amap_street: {
    label: '高德街道图',
    tiles: [
      'https://webrd01.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',
      'https://webrd02.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',
      'https://webrd03.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',
      'https://webrd04.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',
    ],
    attribution: '© 高德地图',
    maxZoom: 18,
    coordSys: 'gcj02',
  },
  amap_satellite: {
    label: '高德卫星图',
    tiles: [
      'https://webst01.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}',
      'https://webst02.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}',
      'https://webst03.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}',
      'https://webst04.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}',
    ],
    attribution: '© 高德地图',
    maxZoom: 18,
    coordSys: 'gcj02',
  },
  carto_dark: {
    label: 'Carto Dark（暗色）',
    tiles: ['https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'],
    attribution: '© CARTO',
    maxZoom: 19,
    coordSys: 'wgs84',
  },
};
```

### 坐标系与偏移处理

| 底图 coordSys | 格点 ImageSource 处理 |
|--------------|---------------------|
| `wgs84` | 直接使用原始 WGS-84 坐标，无需偏移 |
| `gcj02` | 整体边界框修正：经度 +0.01°、纬度 -0.005°（中国区域 GCJ-02 粗略平均偏移，对 1° 格点视觉精度完全可接受） |

```typescript
// composables/useGridLayer.ts
function getGridCorners(basemap: BasemapConfig): [LngLat, LngLat, LngLat, LngLat] {
  // 格点原始边界（WGS-84）：lon 75.0–100.0, lat 25.0–40.0（外扩半格）
  const [w, e, s, n] = [75.0, 100.0, 25.0, 40.0];
  const [dx, dy] = basemap.coordSys === 'gcj02' ? [0.01, -0.005] : [0, 0];
  // MapLibre ImageSource coordinates: [tl, tr, br, bl]
  return [
    [w + dx, n + dy],
    [e + dx, n + dy],
    [e + dx, s + dy],
    [w + dx, s + dy],
  ];
}
```

同理，区域 GeoJSON（来自高德开放平台，GCJ-02）在使用 `wgs84` 底图时需整体偏移修正，在 `gcj02` 底图时直接使用。GeoJSON 坐标变换在加载时执行一次，缓存转换后的结果。

---

## 格点渲染方案（Web Worker）

### 渲染流程

```
主线程：fetch /grid/{gran}/{var}.json（整个 var 在该颗粒度下的全部时间步）
主线程：解析 JSON，提取当前帧的二维数组 shape=(lat, lon)
主线程：postMessage({ frame2d, colormap, lutSize, threshMin, threshMax, targetW, targetH, dxy, convertToMm }) → Worker
Worker：
  0. 若 convertToMm，逐格点做 value[i][j] / dxy[i][j]（先除后插值，见「kg→mm 单位换算」节）
  1. 双线性插值（15×25 → targetW×targetH，默认约 600×400）
  2. 256-LUT 色卡查表（value → RGBA）
  3. 阈值过滤（value < threshMin 或 > threshMax → alpha=0；null → alpha=0）
  4. createImageBitmap(OffscreenCanvas)
  5. postMessage(imageBitmap, [imageBitmap]) → 主线程（Transferable）
主线程：map.getSource('grid-overlay').updateImage({ url: blobURL, coordinates })
```

### 插值方法

双线性插值：在目标画布的每个像素位置，反推对应原始格点坐标，取周围 4 个格点加权平均。缺测值（null）不参与加权，结果为透明像素。

### Colormap LUT

每种 colormap 预计算 256 步 RGBA LUT，渲染前一次性建立，逐帧复用。支持 5 种 colormap：Viridis / Turbo / Magma / Cyan / RdBu。

值域稳定性：色卡量程（vmin/vmax）使用每个 var 的预设自然量程（定义在 `config/vars.ts`），不随帧内数据动态调整，避免颜色抖动。

### 帧缓存

- 最大缓存：20 帧（LRU 淘汰）
- 预加载：当前帧 ±2 帧提前 fetch + 渲染
- 缓存 key：`${var}_${gran}_${frameLabel}`（例：`CWR_month_2015-07`）

---

## 地图交互

### 格点数据模块

**悬停（hover）**：
- 鼠标在地图上移动 → 显示跟随鼠标的轻量 tooltip（CSS 绝对定位，`pointer-events: none`）
- 内容：当前点双线性插值数值 + 单位（不显示坐标）

**点击（pick point）**：
- 地图上放置十字光标标记
- 显示 PinTip 气泡（CSS 绝对定位，绑定到地图投影坐标，随平移/缩放自动更新位置）
- PinTip 内容：经纬度 / 当前时间帧 / 变量名 / 插值数值 + 单位 / [查看历史 ↗] / [✕ 清除]
- 时间轴切帧时，从当前帧 field 重新插值，自动更新 PinTip 数值
- 键盘 Escape → 清除取值点

**右侧 Inspector 面板（取值点已选中时）**：
- 坐标 / 时间 / 变量
- 大字数值 + 单位
- 分位条（数值相对于当前帧 min/max 的百分位）
- [查看历史] 和 [清除] 按钮

### 区域统计模块

**视觉层次（MapLibre FillLayer + LineLayer 实现）**：

| 状态 | fill-color | fill-opacity | line-color | line-width |
|------|-----------|-------------|------------|-----------|
| 西藏轮廓 | — | — | `rgba(88,224,255,0.5)` | 1.5px |
| 各地市边界（始终可见） | — | — | `rgba(88,224,255,0.2)` | 1px |
| 悬停地市 | `#58e0ff` | 0.12 | — | — |
| 选中地市 | `#58e0ff` | 0.25 | `rgba(88,224,255,0.8)` | 2px |

**悬停（hover）**：
- 鼠标进入地市多边形 → 填充变亮 + tooltip（地市名 + 当前聚合模式下该地市的统计数值）
- 鼠标移出西藏边界外 → 无响应
- 数值来源：从已加载的 stats 数据中读取（不发额外请求）

**点击（select region）**：
- 点击地市 → 选中该区域 → 联动更新 SubToolbar 区域选择器 → 地图高亮更新
- 右侧 Inspector 面板展示该区域当前时间帧统计数值
- [查看历史 ↗] → 打开 HistoryModal（ECharts，多变量）
- "西藏自治区（全区）"：只能通过 SubToolbar 区域选择器选择，无法从地图直接点选

---

## 格点数据模块详细设计

### 数据来源

| 聚合模式 | 请求 URL | 帧数 |
|---------|---------|------|
| 逐年 | `/grid/year/{var}.json` | 26 |
| 逐月 | `/grid/month/{var}.json` | 312 |
| 年平均 | `/grid/mean_all/{var}.json` | 1 |
| 月平均 | `/grid/mean_month/{var}.json` | 12 |
| 季平均 | `/grid/mean_season/{var}.json` | 4 |

切换 var 或聚合模式时，请求对应 JSON 文件。已加载的文件缓存在内存中，不重复请求。

### kg→mm 单位换算

> Task #2

仅对 `units === 'kg'` 的变量启用。换算公式：`mm = kg / dxy[i][j]`，`dxy` 来自 `/grid/meta.json` 的 `grid.dxy`（shape 15×25，单位 m²）。

**状态**

```typescript
// composables/useGridLayer.ts
const isKgToMm = ref(false)
// 切换 var 或聚合模式时自动 reset
watch([selVar, mode], () => { isKgToMm.value = false })
```

Legend 和 HistoryModal 均读写同一 `isKgToMm` ref，保持一致。

**UI — 图例面板（Legend）**

- `units === 'kg'`：单位行显示 `[kg] 点击以换算为 mm`，以 `--accent` 色标注，表示可交互
- 激活后切换为 `[mm] 点击以还原为 kg`
- 其他单位：静态文字，不可交互，样式不变

**UI — HistoryModal 标题栏**（仅格点数据模块，`units === 'kg'` 时）

- 标题文字（`历史数据·{varName}`）右侧追加切换按钮，文案 `kg→mm` / `mm→kg`
- 与标题文字的间距用 `gap`（`em` 单位），禁止使用 `px`

**渲染路径**

| 路径 | 方法 | 说明 |
|------|------|------|
| Worker 格点渲染 | 先除后插值：逐格点 `value[i][j] / dxy[i][j]`，再做双线性升采样 | 物理上正确（mm 场再上采样）|
| HistoryModal 取值点 | 先插值后除：`interp(frame, lat, lon) / interp(dxy, lat, lon)` | `dxy_val` 一次性计算，312 帧共用 |

**缓存策略**

| 缓存层 | 单位切换时 |
|--------|-----------|
| 原始帧数据（kg 值） | 保留，不重新 fetch |
| ImageBitmap 渲染缓存 | 立即全部清空，按新单位重渲染当前帧 |

kg→mm 和 mm→kg 双向切换均不产生额外网络请求。

**量程联动**

切换单位（任意方向）时，立即清除用户手动填写的 min/max，使用自动量程（由新单位数据推算）。用户此后若重新输入 min/max，遵循原有逻辑。

---

### HistoryModal（格点数据）

点击 [查看历史] 打开 880×560 模态框，展示选中点在完整时间轴上的数值序列。

**数据来源**：纯前端计算，从已加载的格点 JSON 中对选中点（lat, lon）做双线性插值：

| 模态内 Tab | 数据来源 JSON | 帧数 |
|-----------|-------------|------|
| 逐月 | `/grid/month/{var}.json` | 312 |
| 逐年 | `/grid/year/{var}.json` | 26 |
| 多年月均 | `/grid/mean_month/{var}.json` | 12 |
| 多年季均 | `/grid/mean_season/{var}.json` | 4 |

按需加载：首次打开某 Tab 时 fetch 对应 JSON（若已在主视图缓存则直接复用）。

**图表（ECharts 折线图）**：
- 横轴：时间标签（月份/年份/月名/季节名）
- 纵轴：数值（var 单位）
- 当前帧：橙色竖线高亮
- 悬停：ECharts tooltip 显示时间 + 数值
- 点击图表上某帧 → 关闭 Modal 并跳转主视图到该帧

**统计卡片**（图表上方）：帧数 / MIN / MEAN / MAX / 极值时刻

---

### 格点叠加层（F-22 / F-23 / F-24）

在格点色彩图层之上叠加三种可独立开关的信息层，开关入口放在**图例面板底部**，3 个文字按钮并排（`等值线 ｜ 高低点 ｜ 数值`），激活状态用 `--accent` 色高亮。

**数值格式（三层通用）**：`toPrecision(4)`，大数自动切科学计数法（如 `1.235e+13`），不显示单位。

#### 等值线（F-22）

> Task F-22，依赖 `d3-contour`（需 `pnpm add d3-contour`）

**数据来源**：当前渲染帧的格点数据（已折算为展示单位，kg→mm 开启时用 mm 值）。

**计算**：以当前帧 `vmin`、`vmax` 均分 8 级阈值，调用 `d3.contours().size([nLon, nLat]).thresholds(thresholds)(flatData)` 生成等值面多边形（marching squares），在主线程执行（375 点，耗时 < 1ms）。

**坐标变换**：d3-contour 输出坐标系为格点索引空间 `[j, i]`（列×行），需映射回经纬度：
```
lon = lon_array[j]  // 线性插值
lat = lat_array[i]
```
输出为 WGS-84 坐标的 GeoJSON FeatureCollection，与格点叠加层坐标系一致。

**渲染**：作为 MapLibre `geojson` source + `line` layer 叠加。等值线颜色固定为 `rgba(255,255,255,0.7)`；线型按 4 种样式循环（以属性 `level_idx % 4` 驱动）：

| `level_idx % 4` | 线型 | 线宽 |
|-----------------|------|------|
| 0 | 细虚线 `[4, 4]` | 1px |
| 1 | 粗虚线 `[6, 4]` | 2px |
| 2 | 细实线 | 1px |
| 3 | 粗实线 | 2.5px |

**数值标注**：在每条等值线的视觉中点放置文字标注（MapLibre `symbol` layer），样式：白色文字、深色描边，`font-size: 11`，`text-allow-overlap: false`。

**触发重算**：帧切换、kg↔mm 切换、等值线开关激活时。

#### 高低点（F-23）

**算法**：对当前帧格点数据做 8-邻域比较（grid[i][j] 与周围 8 点对比），找出所有局部极大值和局部极小值（忽略边缘格点和缺测点）。

**筛选**：取极大值 top-3（按值降序）、极小值 top-3（按值升序），防止稀疏网格产生过多噪声极值点。

**渲染**：MapLibre `symbol` layer，文字标注格式：
- 极大值：`H` 前缀 + 换行 + 数值，颜色 `#ff7c7c`（暖色）
- 极小值：`L` 前缀 + 换行 + 数值，颜色 `#58e0ff`（冷色）

**触发重算**：与等值线相同。

#### 数值标注（F-24，低优先级）

在每个格点中心显示该点数值，随缩放级别动态显示（`min-zoom: 6`，zoom < 6 时不渲染），`text-allow-overlap: false` 避免密集重叠。使用 MapLibre `symbol` layer，数值格式同上。

---

## 区域统计模块详细设计

### 区域边界视觉清晰度（F-21）

> Task F-21（Enhancement）：在格点色彩图层可见时，区域边界与区域区分度不足，改善为"聚光灯"视觉效果。

**最终方案**："聚光灯"三层视觉层次，核心原则是填充不遮格点、边界提供定位。

**视觉层次**（由暗到亮）：

| 区域 | fill | 边界线 |
|------|------|--------|
| 西藏以外 | 反向遮罩多边形，0.8 暗色 | — |
| 地市（非选中，全区模式） | 0（透明） | 隐藏 |
| 地市（非选中，地市模式） | 0.8 暗色 | 隐藏（hover 时全量显现） |
| 选中地市 | 0（透明，格点完整可见） | 白色 1.5px + 3px 暗晕 |
| 西藏全区（xizang） | 始终 0 | 白色 1.5px + 3px 暗晕（永远显示） |

**Hover 交互**：鼠标进入任意地市区域时，所有地市边界线批量显现（`lineVisible` feature-state），离开时批量隐藏；hovered 区域边界加粗（2px + 4px 暗晕）。

**自动居中**：选中区域变化时调用 `map.fitBounds()`，padding 60px，动画 800ms；进入模块时瞬间定位（duration: 0）。

**关键实现细节**：
- 反向遮罩：以 xizang polygon 为"洞"、世界边界框为外环，构造 GeoJSON Polygon，作为独立 source + fill layer
- `dimmed` feature-state：选中地市时对其余地市批量设为 true（0.8 暗化），回到全区时批量清除
- `lineVisible` feature-state：hover 进入/离开时对全部 `DISTRICT_IDS` 批量开关

**相关文件**：`frontend/src/composables/useRegionLayer.ts`

---

### 数据加载策略

切换区域、切换聚合模式时，按需请求对应 granularity 的数据（单次请求返回全部 15 个 var）：

```
GET /api/v1/stats?region_id={id}&granularity={mode}&year_start=2000&year_end=2025
```

结果缓存到 `stores/region.ts` 的 `statsCache`（key：`{region_id}_{granularity}`）。命中缓存则跳过请求。

所有时间聚合（年平均、月平均、季平均）均由后端 SQL 完成，前端无客户端计算逻辑：

| 聚合模式 | granularity 参数 | 后端处理 | 帧数 |
|---------|----------------|---------|------|
| 逐年 | `year` | `SELECT WHERE` | 26 |
| 逐月 | `month` | `SELECT WHERE` | 312 |
| 年平均 | `mean_all` | `AVG(...)` | 1 |
| 月平均 | `mean_month` | `AVG(...) GROUP BY month` | 12 |
| 季平均 | `mean_season` | `AVG(...) GROUP BY season` | 4 |

### kg→mm 单位换算

与格点数据模块复用同一套交互逻辑，但换算分母不同。

**换算公式**：`mm = region_kg / area_m2`

`area_m2`（区域有效面积）从 `/api/v1/meta/regions` 响应的 `area_m2` 字段读取，由 `regionStore.regions` 缓存。计算方式与生成 stats.db 的空间聚合路径一致（见 `data-pipeline.md`）。

**状态**

复用格点模块导出的 `isKgToMm` ref（`composables/useGridLayer.ts`），无需额外状态。区域统计模块与格点数据模块共享该开关，切换时两侧同步；切换选中区域（`selRegionId` 变化）时**不重置** `isKgToMm`，保持当前单位以便跨区域对比。

**UI — 图例面板（Legend）**

同格点模块，`units === 'kg'` 时出现单位切换按钮，行为完全一致。

**UI — RegionHistoryModal 标题栏**

- `units === 'kg'` 时，标题右侧追加切换按钮，文案 `kg→mm` / `mm→kg`（与 HistoryModal 格点模式相同）
- 与 `isKgToMm` 双向绑定，点击切换后图表立即更新

**换算路径**

| 位置 | 方式 |
|------|------|
| RegionModule Inspector 展示值 | `value / region.area_m2`（组件层，不改 store） |
| RegionHistoryModal 折线数据 | 取 `statsCache` 行的 kg 值后 `/ area_m2`，Y 轴单位改为 `mm` |

**若 `area_m2` 为 null**（stats.db 未生成或版本不兼容）：Legend 的单位切换按钮不显示，行为退回纯 kg 展示。

### HistoryModal（区域统计）

点击 [查看历史] 打开 880×560 模态框，支持多变量叠加展示。

**数据来源**：后端 `/api/v1/stats` 接口，statsCache 命中则直接复用。

**图表（ECharts 折线图）**：
- 默认加载当前聚合模式下当前选中 var 的折线
- **追加变量**：图表内"+ 添加变量"按钮 → 选择 var → 复用 statsCache 中对应数据（已缓存则无需请求）→ 追加折线
- 多变量共享横轴；同单位共用一条 Y 轴，不同单位增加右侧 Y 轴
- 多变量配色：独立 palette，首色 `--accent`，次色暖/冷交替序列
- 当前帧：橙色竖线高亮；点击图表某帧 → 关闭 Modal 并跳转主视图到该帧

**Modal 内 Tab**：

| Tab | granularity | 帧数 | 数据来源 |
|-----|------------|------|---------|
| 逐月 | `month` | 312 | statsCache 或后端请求 |
| 逐年 | `year` | 26 | statsCache 或后端请求 |
| 月平均 | `mean_month` | 12 | statsCache 或后端请求 |
| 季平均 | `mean_season` | 4 | statsCache 或后端请求 |

---

## 数据导出模块

简洁的下载表单页，居中布局：

```
数据导出

  区域    [西藏自治区（全区）    ▾]
  年份    [全部                 ▾]

                      [⬇ 下载报告]

  ℹ 报告为 .docx 格式，由数据团队预生成。
    若所选组合暂无报告，将在此处提示"文件不存在"。
```

- 区域选择器：与区域统计模块相同的下拉组件（复用）
- 年份下拉：`全部` / `2000` / `2001` / … / `2025`
- 点击下载 → `GET /api/v1/report/download?region_id=...&start=...&end=...`
- 后端返回文件流 → 浏览器直接触发下载；404 → 页面内错误提示

---

## 时间轴（BottomBar）

仅在格点数据（`grid`）和区域统计（`region`）模块显示。格点数据与区域统计**共享同一时间轴状态**（Pinia `stores/time.ts`），切换 Tab 时时间选择保留。

### 控件布局

```
[◀ 上一帧]  [▶/⏸ 播放]  [▶ 下一帧]  MODE·原始·逐月  FRAME 2015-07 (187/312)  ─────────  SPEED [0.5×][1×][2×][4×]
══════════════════════════════════════════════════════════════════════════════════════
   ↑ 刻度轨道：major tick = 每 5 年（逐年）或每年 1 月（逐月）；handle = 当前位置游标
```

### 播放机制

- 驱动：`setInterval`（避免 rAF 在标签页失焦时暂停）
- 播放间隔：`Math.max(80, 300 / speed)` ms（speed ∈ {0.5, 1, 2, 4}）
- 播放速度**按聚合模式分别持久化**到 localStorage（5 种模式各一个 key）
- 静态帧（年平均，仅 1 帧）：隐藏播放控件，轨道显示"静态帧 · 该模式下时间已聚合"

### 键盘快捷键

| 键 | 动作 |
|----|------|
| `←` | 上一帧 |
| `→` | 下一帧 |
| `Space` | 播放/暂停 |

（输入框获焦时上述快捷键失效）

---

## 右侧面板（Right Stack）

两个面板竖向堆叠，浮动于地图右侧（宽 260px）。位置（左/右）通过用户设置配置。

### 图例面板（Legend）

- 变量标识：`code` + `long_name`
- 单位行：`units === 'kg'` 时显示可交互的换算按钮（见「kg→mm 单位换算」节）；其他单位静态展示
- 统计行：MIN / MEAN / MAX（当前帧的全域统计）
- 色标条：canvas 渲染，横向渐变
- 量程刻度：min / mid / max（使用 var 预设量程，非帧内动态）
- **Colormap 选择器**：5 个色带小方块（Viridis / Turbo / Magma / Cyan / RdBu），当前选中项有 accent 边框
  - 选择**按 var 分别持久化**到 localStorage（key：`cwrvis:colormap:{varName}`）

### 取值点/区域面板（Inspector）

**格点数据模块（取值点选中时）**：
- COORD / TIME / VAR 标签行
- 大字数值 + 单位
- 分位条（当前帧 min/max 的百分位）
- [查看历史] [清除] 按钮

**区域统计模块（区域选中时）**：
- 区域名称 / TIME / VAR
- 当前聚合时间帧的区域统计数值
- [查看历史] [清除] 按钮

---

## 用户设置

### 入口

ProductNav 右端 `⚙` 图标 → 打开设置 Overlay（半透明遮罩 + 面板，不阻塞地图操作）。

### 存储

全部持久化到 `localStorage`，无需鉴权，刷新后自动恢复。

### 设置项

| 设置项 | 类型 | localStorage Key | 持久化粒度 | 默认值 |
|--------|------|-----------------|-----------|--------|
| 底图类型 | `BasemapId` | `cwrvis:basemap` | 全局 | `'osm'` |
| 图例位置 | `'left' \| 'right'` | `cwrvis:legend_pos` | 全局 | `'right'` |
| Colormap | `ColormapName` | `cwrvis:colormap:{varName}` | 按 var | `'turbo'` |
| 播放速度 | `number` | `cwrvis:speed:{modeId}` | 按聚合模式 | `1` |

### 重置

设置面板底部"恢复默认值"按钮 → 删除所有 `cwrvis:` 前缀的 localStorage 条目 → `window.location.reload()`。

---

## 全局共享状态（Pinia Stores）

格点数据和区域统计模块共享以下状态，切换 Tab 时保留。

```typescript
// stores/time.ts — 时间轴状态（两模块共享）
type AggMode = 'monthly' | 'yearly' | 'avg_yearly' | 'avg_monthly' | 'avg_season';
type Season  = 'spring' | 'summer' | 'autumn' | 'winter';

interface FrameSel {
  year:   number;   // 用于 monthly / yearly / avg_monthly 模式
  month:  number;   // 用于 monthly / avg_monthly 模式
  season: Season;   // 用于 avg_season 模式
}

interface TimeState {
  mode:    AggMode;
  sel:     FrameSel;
  playing: boolean;
}

// stores/var.ts — 当前变量（两模块共享）
interface VarState {
  selVar: string;   // var name, e.g. 'CWR'
}

// stores/region.ts — 区域状态（仅区域统计模块使用）
// 每行包含时间字段（year/month/season）+ 全部 15 个 var 的数值
type StatsRow = {
  year?:   number;
  month?:  number;
  season?: string;
} & Record<string, number | null>;

interface RegionStatsData {
  granularity: AggMode;
  rows:        StatsRow[];
}

interface RegionState {
  selRegionId: string;                          // e.g. 'xizang' | 'lasa'
  regions:     RegionMeta[];                    // 从 /api/v1/meta/regions 加载
  statsCache:  Map<string, RegionStatsData>;    // key: '{regionId}_{granularity}'
}

// stores/meta.ts — 格点元数据（启动时加载一次）
interface MetaState {
  grid:     GridMeta;                           // 来自 /grid/meta.json
  vars:     Record<string, VarMeta>;
  timeline: TimelineMeta;
}

// stores/settings.ts — 用户设置（从 localStorage 初始化）
interface SettingsState {
  basemap:        BasemapId;
  legendPosition: 'left' | 'right';
  colormaps:      Record<string, string>;       // varName → colormapName
  speeds:         Record<AggMode, number>;      // modeId → speed
}
```

---

## 项目结构

```
frontend/src/
├── main.ts
├── App.vue                    # 路由顶层，Tab 切换渲染对应模块
│
├── types/
│   └── index.ts               # VarName, RegionId, AggMode, FrameSel, BasemapId 等公共类型
│
├── config/
│   ├── vars.ts                # 所有 var 的元数据与色卡控制点（前端固化配置）
│   ├── basemaps.ts            # 底图 provider 配置（见上节）
│   └── constants.ts           # YEAR_MIN=2000, YEAR_MAX=2025, SEASONS 定义等
│
├── stores/
│   ├── time.ts                # 时间轴状态（AggMode + FrameSel + playing）
│   ├── var.ts                 # 当前选中变量
│   ├── region.ts              # 区域选择 + stats 数据缓存
│   ├── meta.ts                # 格点元数据（grid/meta.json）
│   └── settings.ts            # 用户设置（localStorage 持久化）
│
├── workers/
│   └── gridRenderer.worker.ts # Web Worker：双线性插值 + LUT 色卡映射 → ImageBitmap
│
├── composables/
│   ├── useMap.ts              # MapLibre 实例管理、底图切换
│   ├── useGridLayer.ts        # 格点图层（fetch、帧缓存、Worker 渲染、ImageSource 更新）
│   ├── useRegionLayer.ts      # 区域 GeoJSON 图层（加载、高亮状态管理）
│   ├── useTimeline.ts         # 时间轴播放器（setInterval 驱动）
│   └── useLocalStorage.ts     # localStorage 读写工具
│
└── components/
    ├── layout/
    │   ├── ProductNav.vue         # 顶部模块导航栏
    │   ├── SubToolbar.vue         # 子工具栏（根据当前模块渲染不同内容）
    │   ├── LeftRail.vue           # 左侧图标轨道
    │   ├── CategoryFlyout.vue     # 变量分类飞出面板
    │   └── BottomBar.vue          # 时间轴控制栏
    │
    ├── map/
    │   ├── MapView.vue            # 地图容器（MapLibre 挂载点）
    │   ├── HoverTooltip.vue       # 悬停数值 tooltip（pointer-events: none）
    │   └── PinTip.vue             # 格点取值点气泡（跟随地图投影坐标）
    │
    ├── panels/
    │   ├── Legend.vue             # 图例 + colormap 选择
    │   ├── Inspector.vue          # 取值点/区域详情面板
    │   └── SettingsPanel.vue      # 用户设置面板（overlay）
    │
    ├── modals/
    │   └── HistoryModal.vue       # 历史数据图表 Modal（ECharts，格点/区域两种数据源）
    │
    └── modules/
        ├── GridModule.vue         # 格点数据模块容器
        ├── RegionModule.vue       # 区域统计模块容器
        ├── ExportModule.vue       # 数据导出模块
        └── PlaceholderModule.vue  # 占位模块（总览/时序分析/站点观测/模式诊断）
```

---

## 环境变量与配置

`frontend/.env`：
```
VITE_API_BASE=/api/v1
VITE_GRID_BASE=/grid
VITE_SHAPES_BASE=/shapes
```

`frontend/.env.development`（开发时 Vite dev proxy 转发到本地 FastAPI）：
```
VITE_API_BASE=http://localhost:8000/api/v1
VITE_GRID_BASE=http://localhost:8000/grid
VITE_SHAPES_BASE=http://localhost:8000/shapes
```

---

## 构建与部署

```bash
cd frontend
nvm use
pnpm install
pnpm tsc --noEmit    # 类型检查，必须通过
pnpm build           # 产物在 frontend/dist/
# 拷贝至分发包 static/web/
```

---

## 技术决策记录（联调后补充）

### Canvas 渲染方案：ImageBitmap → 原始像素 ArrayBuffer

**背景**：Worker 初始实现使用 `OffscreenCanvas.transferToImageBitmap()` 生成 ImageBitmap，主线程用 `ctx.drawImage(bitmap)` 贴到 canvas，再由 MapLibre 的 CanvasSource 读取。

**问题**：Chrome 对调用了 `drawImage(ImageBitmap)` 的 canvas 进行 GPU 加速后，`texImage2D(canvas)` 读到的 CPU buffer 为全零，导致模块切换后图层消失（格点色块变透明）。尝试 `willReadFrequently: true`、`play/pause`、`rAF` 等方案均无效。

**决策**：Worker 直接传输原始 `Uint8ClampedArray.buffer`（Transferable，零拷贝），主线程用 `ctx.putImageData(new ImageData(pixels, w, h), 0, 0)` 写入。`putImageData` 是纯 CPU 操作，始终写入 CPU buffer，`texImage2D` 能可靠读取。

**副作用**：无。Worker 侧还节省了 `createImageBitmap`（async）的开销，渲染延迟略有改善。

**相关文件**：`frontend/src/workers/gridRenderer.worker.ts`、`frontend/src/composables/useGridLayer.ts`

---

### 格点图层色卡量程策略

**规则**：
1. **默认（用户未输入）**：每帧独立从当帧数据自动计算 min/max，映射到色卡全范围。颜色含义随帧变化，适合观察帧内相对分布。
2. **用户覆盖**：在图例阈值输入框输入值后，该值优先于自动计算，且在同一 `var + 聚合模式` 下跨帧保留。
3. **量程清除时机**：切换 var 或聚合模式时阈值自动清空；切换单位（kg↔mm）时同样立即清空，使用新单位下的自动量程。
4. **超出量程着色**：低于 vmin 按 vmin 的颜色渲染，高于 vmax 按 vmax 的颜色渲染（clamp），而非透明。只有真正的缺测格点（null）才渲染为透明。

**相关文件**：`frontend/src/workers/gridRenderer.worker.ts`、`frontend/src/composables/useGridLayer.ts`、`frontend/src/components/panels/Legend.vue`

---

### CSS 单位规范

见独立文档：`docs/design/css-units.md`

全站以 `rem` 为主要字号和布局尺寸单位，组件内间距用 `em`，物理像素语义明确时（细线、ECharts 画布高度）保留 `px`。

---

## 性能目标

| 指标 | 目标值 |
|------|--------|
| 首屏加载时间（冷启动） | < 3s（地图底图渲染完成） |
| 切帧响应（帧已缓存） | < 50ms |
| 切帧响应（帧未缓存） | < 1s（含 fetch + Worker 渲染） |
| Worker 渲染单帧 | < 100ms |
| 区域统计接口响应 | < 200ms |
| 历史数据首次加载 | < 1s |
