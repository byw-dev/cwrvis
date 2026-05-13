# 前端架构与渲染方案设计 — cwrvis

> 文档版本：v1.0  
> 对应模块：`frontend/`

---

## 开发环境约束（强制）

| 工具 | 版本 | 管理方式 |
|------|------|----------|
| Node.js | v24.15.0（Krypton） | nvm，版本固化于项目根 `.nvmrc` |
| pnpm | 最新稳定版 | corepack，版本固化于 `frontend/package.json` 的 `packageManager` 字段 |

**使用方式**：
```bash
# 切换到项目指定 Node.js 版本
nvm use

# 首次启用 corepack（Node.js 内置，一次性操作）
corepack enable

# 之后正常使用 pnpm，corepack 自动匹配 package.json 中声明的版本
pnpm install
```

**禁止**直接使用 `npm` 或全局安装的 `pnpm` 绕过 corepack。

---

## 技术栈

| 技术 | 版本要求 | 用途 |
|------|----------|------|
| Vue 3 | ≥ 3.4 | 前端框架（Composition API） |
| Vite | ≥ 6.0 | 构建工具 |
| MapLibre GL JS | ≥ 4.0 | 地图渲染引擎 |
| ECharts | ≥ 5.5 | 区域统计图表 |
| Pinia | ≥ 2.0 | 状态管理 |

UI 组件库：不引入（保持轻量），CSS 手写。

---

## 项目结构

```
frontend/src/
├── main.js
├── App.vue
│
├── config/
│   ├── vars.js          # data_var 色卡与元数据（固化，从后端拉取后缓存）
│   ├── amap.js          # 高德瓦片 URL 配置
│   └── constants.js     # 时间范围、颗粒度等常量
│
├── stores/
│   ├── time.js          # 当前颗粒度、年份、月份、播放状态
│   ├── var.js           # 当前选中的 data_var、色卡阈值过滤状态
│   ├── region.js        # 预设区域列表、当前选中区域
│   └── meta.js          # 从后端拉取的 var/region 元数据
│
├── workers/
│   └── gridRenderer.worker.js   # 格点渲染 Web Worker
│
├── composables/
│   ├── useGridLayer.js  # 格点图层管理（fetch、缓存、更新）
│   ├── useTimeline.js   # 时间轴播放器逻辑
│   ├── useStats.js      # 区域统计数据请求
│   └── useMap.js        # MapLibre 实例管理
│
└── components/
    ├── MapView.vue          # 地图容器，挂载 MapLibre
    ├── GridLayer.vue        # 格点叠加层控制（透明度、显隐）
    ├── RegionLayer.vue      # 区域 GeoJSON 叠加层
    ├── Timeline.vue         # 时间轴控制条
    ├── VarSelector.vue      # data_var 选择器
    ├── ColorLegend.vue      # 色卡图例（可点击分段过滤）
    ├── StatsPanel.vue       # 区域统计侧边面板
    ├── StatsChart.vue       # ECharts 时间序列图
    ├── ReportDownload.vue   # 报告下载控件
    └── LayerSwitcher.vue    # 底图切换（街道/卫星）
```

---

## 地图底图配置

### 高德瓦片接入

```javascript
// config/amap.js
export const AMAP_LAYERS = {
  street: {
    label: '街道图',
    url: 'https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',
    subdomains: ['1', '2', '3', '4'],
  },
  satellite: {
    label: '卫星图',
    url: 'https://webst0{s}.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}',
    subdomains: ['1', '2', '3', '4'],
  },
  satelliteLabel: {
    label: '卫星+标注',
    // 叠加街道标注层
  },
}
```

MapLibre 使用 `type: 'raster'` source 加载。

### 坐标系说明

高德底图坐标系为 GCJ-02。格点数据为 WGS-84。

在格点 ImageSource 的 `coordinates` 参数（四个角点坐标）处，使用简单的整体偏移校正。中国区域 GCJ-02 与 WGS-84 的偏移约为经度 +0.01°、纬度 -0.005°（粗略平均值），对于 1 度格点精度可完全接受。

---

## 格点渲染方案

### Web Worker 渲染流程

```
主线程
  │── fetch /grid/{gran}/{var}.json（整个 var 的全时间轴数据）
  │── 解析 JSON，按帧索引提取当前帧的二维数组
  │── postMessage({ data, colorScale, thresholds, targetWidth, targetHeight }) → Worker
  │
  Worker (gridRenderer.worker.js)
  │── 双线性插值（将 ~60×70 原始网格升采样至目标像素尺寸）
  │── 色卡映射（value → RGBA，查找表加速）
  │── 阈值过滤（value < min 或 value > max → alpha = 0）
  │── createImageBitmap(OffscreenCanvas)
  │── postMessage(imageBitmap, [imageBitmap]) → 主线程（transferable）
  │
主线程
  └── map.getSource('grid').updateImage({ url: blobUrl, coordinates: bounds })
```

### 插值方法

使用**双线性插值**。在目标画布的每个像素位置，反推对应原始格点坐标，取周围 4 个格点加权平均。

NaN（null）格点：插值时跳过（设为透明），不参与加权平均。

### 色卡映射

色卡为分段线性，每个 var 在 `config/vars.js` 中定义若干控制点（value, color）。渲染前预计算 1024 步长的查找表（LUT），映射时直接查表，避免插值计算开销。

### 阈值过滤

ColorLegend 组件中，用户可点击色卡的分段控制点：
- 点击某个值，切换"隐藏小于此值"或"隐藏大于此值"
- 状态存储在 `stores/var.js` 的 `thresholdMin` 和 `thresholdMax`
- 每次阈值变化，重新触发 Worker 渲染（数据已缓存，仅重新绘制，速度快）

---

## 时间轴播放器设计

### 状态（`stores/time.js`）

```javascript
{
  granularity: 'year',      // 'year' | 'month'
  currentYear: 2010,
  currentMonth: 1,          // 仅 granularity='month' 时有效
  isPlaying: false,
  playInterval: 800,        // ms/帧，可调
  yearRange: [2000, 2024],  // 固定
}
```

### 帧序列定义

```javascript
// granularity = 'year': 帧列表为 [2000, 2001, ..., 2024]
// granularity = 'month'，选定年份 Y: 帧列表为 [{year:Y, month:1}, ..., {year:Y, month:12}]
```

### 预加载策略（`composables/useTimeline.js`）

```javascript
// 预加载队列：当前帧 + 后续 N 帧
const PRELOAD_AHEAD = 3
const CACHE_MAX = 20  // LRU 最大缓存帧数

// 每次切帧后，异步触发后续帧的 fetch + render，缓存 ImageBitmap
// 切换时若目标帧已缓存，直接更新 ImageSource，无网络等待
```

### 播放控制 UI（`Timeline.vue`）

```
[◀◀] [▶/⏸] [▶▶]   |▓▓▓▓▓▓░░░░░░|   2010年 / 2010年3月
                    拖动 slider
```

---

## 区域统计面板设计

### 交互流程

1. 用户点击地图上的预设区域（RegionLayer 响应 click 事件）
2. StatsPanel 展开（侧边栏或底部抽屉）
3. 自动请求当前时间范围和当前 var 的统计数据
4. ECharts 渲染时间序列折线图（年颗粒度）或柱状图（月颗粒度）

### StatsPanel 状态

- 当前选中区域（region_id、name）
- 当前展示的 var（跟随地图主视图的 var 选择）
- 加载状态、错误状态

### 报告下载（`ReportDownload.vue`）

在 StatsPanel 底部展示：
```
[选择时间范围] [下载报告]
```

点击"下载报告"时：
1. 拼接下载 URL：`/api/v1/report/download?region_id=...&granularity=...&start=...&end=...`
2. 用 `<a download>` 触发浏览器下载
3. 若后端返回 404，显示"该组合暂无报告"提示

---

## 环境变量与配置

`frontend/.env`：
```
VITE_API_BASE=/api/v1
VITE_GRID_BASE=/grid
VITE_AMAP_KEY=你的高德Key
```

`frontend/.env.development`（本地开发，Vite 代理转发到本地 FastAPI）：
```
VITE_API_BASE=http://localhost:8000/api/v1
VITE_GRID_BASE=http://localhost:8000/grid
```

---

## 构建与部署

```bash
cd frontend
nvm use           # 切换至 .nvmrc 指定的 Node.js 版本
pnpm install
pnpm build
# 产物在 frontend/dist/，拷贝至分发包 static/web/
```

构建产物由 FastAPI StaticFiles 托管（见 deployment.md）。

---

## 性能目标

| 指标 | 目标值 |
|------|--------|
| 首屏加载时间（冷启动） | < 3s（地图底图加载完成） |
| 切帧响应时间（已缓存） | < 50ms |
| 切帧响应时间（未缓存） | < 1s（含 fetch + 渲染） |
| Worker 渲染单帧耗时 | < 200ms |
| 区域统计接口响应 | < 200ms |
