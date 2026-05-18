# 等值线实现调研笔记

> 调研对象：`https://cwr.cheeroi.com/`（云水资源应用分析平台）  
> 调研时间：2026-05-16  
> 目的：解决 cwrvis 等值线"画框"问题、平滑度不足问题

---

## 一、数据格式

**接口**：`GET /cwr/aveMv/202001.json`

```json
{
  "0": {
    "header": {
      "dx": 1, "dy": 1,
      "lo1": 70.5, "la1": 55.5,
      "lo2": 140.5, "la2": 15.5,
      "nx": 71, "ny": 41,
      "numberPoints": 2911,
      "var_min": 0.74, "var_max": 38.73,
      "name": "aveMv", "unit": "kg"
    },
    "data": [5.09, 5.08, ...]   // 一维 flat array，长度 = nx × ny = 2911
  }
}
```

数据已经是展示单位（mm 量级），行优先存储，从左上角（lo1, la1）开始，lon 方向优先。

---

## 二、等值线 Worker 架构

等值线计算完全在独立 Web Worker 中执行（`isoline.worker-BOj3c-F3.js`，5KB），主线程通过 `postMessage` 传入 `{config, header, data}`，Worker 返回计算好的坐标序列。

---

## 三、核心算法：MarchingSquaresJS

**库**：[MarchingSquaresJS v1.3.3](https://github.com/RaumZeit/MarchingSquares.js)（npm：`marchingsquares`）

调用方式：
```js
import { isoLines } from 'marchingsquares'

const lines = isoLines(data2D, thresholds, {
  noFrame: true,      // ← 关键：禁止在格点矩形边框处闭合多边形
  linearRing: false,  // ← 输出开放折线（非闭合环）
})
```

- `data2D`：二维数组 `number[][]`，行 = lat，列 = lon
- `thresholds`：阈值数组（数字升序排列）
- 返回值：`lines[i]` 对应第 `i` 个阈值，`lines[i][j]` 是该阈值的第 `j` 条线段，每条线段是 `[col, row]` 坐标的数组

### noFrame 的意义

`noFrame: true` 是解决"画框"问题的原生方案。

MarchingSquaresJS 默认会在等值面延伸到格点边界时，沿矩形边框补边使多边形闭合，产生沿边走的线段（画框效果）。`noFrame: true` 直接禁止这一行为，等值线到达边界时截断，不补边。

d3-contour 没有等效选项，只能事后裁剪（复杂且不完美）。

---

## 四、后处理流水线

```
MarchingSquaresJS 输出（格点索引坐标的折线段）
  ↓
1. 合并（merge）：将首尾相接的线段拼成更长的折线
  ↓
2. Ramer-Douglas-Peucker（RDP）化简：tolerance = 0.1（格点单位）
   去掉视觉上不必要的冗余点，减少后续平滑计算量
  ↓
3. Chaikin 平滑：对每两个相邻点插入 0.75/0.25 和 0.25/0.75 两个中间点
   公式：P_a = 0.75*P_i + 0.25*P_{i+1}
          P_b = 0.25*P_i + 0.75*P_{i+1}
   闭合线段做旋转处理后再平滑
  ↓
4. 坐标变换（格点索引 → 经纬度）：
   lon = col * dx + lo1
   lat = la1 - row * dy
```

### Chaikin 算法实现（从 worker 提取）

```js
function chaikin(pts) {
  const result = [pts[0]]
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1]
    result.push([0.75 * x0 + 0.25 * x1, 0.75 * y0 + 0.25 * y1])
    result.push([0.25 * x0 + 0.75 * x1, 0.25 * y0 + 0.75 * y1])
  }
  result.push(pts[pts.length - 1])
  return result
}
```

### RDP 化简

标准 Ramer-Douglas-Peucker，tolerance = 0.1（在格点索引空间，约对应 0.1 × dx 的地理距离）。RDP 先于 Chaikin 执行，目的是减少无效折点，让 Chaikin 平滑质量更高。

---

## 五、阈值生成策略

```js
const I = Math.floor(levels / md)   // md 来自外部配置（分辨率倍数）
const thresholds = intervals        // 若有预设区间，直接用
  || Array.from({ length: I }, (_, k) => vmin + (vmax - vmin) * (k + 1) / (I + 1))
```

`aveMv` 配置：`levels: 30`，无预设 `intervals`，故按 vmin/vmax 均分。这与我们的 cwrvis 方案（vmin/vmax 均分 8 条）思路一致。

---

## 六、与 cwrvis 当前方案的对比

| 维度 | cwrvis（当前） | cwr.cheeroi.com |
|------|---------------|-----------------|
| 库 | d3-contour | MarchingSquaresJS |
| 输入格式 | Float64Array（flat） | `number[][]`（2D） |
| 画框问题 | 事后边界裁剪（不完美） | `noFrame: true` 原生解决 |
| 平滑方案 | 5× 双线性上采样 | RDP + Chaikin（事后处理） |
| 输出类型 | MultiPolygon → 提取 LineString | 直接输出开放折线 |
| Worker | 无（主线程） | 专用 Web Worker |

---

## 六、渲染层样式（deck.gl）

等值线不使用 MapLibre 原生图层，而是通过 **deck.gl**（`PathLayer` + `TextLayer`）渲染在叠加层上。

### 等值线（PathLayer）

```js
new PathLayer({
  data: Ri[t],               // 第 t 个阈值的所有线段（已是经纬度坐标数组）
  getPath: e => e,           // 每条线段直接就是坐标数组
  getColor: Ei[t],           // RGBA 数组，自动生成的 HSL 颜色
  getWidth: 1.2 * lineWidthSetting,  // 用户可配置粗细 × 1.2
  widthUnits: 'pixels',
  jointRounded: true,        // 拐角圆润
})
```

**颜色生成**：对 N 条等值线，在色相环 360° 内均匀取 N 个色相（步长 = 360/N），每条线随机化饱和度（30–60%）和亮度（70–90%）。效果是：每条等值线颜色不同，整体为柔和的彩虹色系，不刺眼。

### 数值标注（TextLayer）

```js
// 每 50 个坐标点取一个标注位置
for (let i = 0; i < line.length - 10; i += 50) {
  anchor = line[i]       // 标注锚点
  next   = line[i + 1]   // 下一点（用于计算旋转角度）
}

new TextLayer({
  getPosition: e => e.position.anchor,
  getText: e => e.label.toFixed(2),          // 2位小数
  getAngle: e => Bi(anchor, next),           // 沿线方向旋转
  getSize: 12,                               // 12px
  getColor: [0, 0, 0, 255],                 // 黑色文字
  background: true,                          // 开启背景色块
  backgroundBorderRadius: 10,               // 圆角 10px（近似椭圆/胶囊形）
  backgroundPadding: [2, 1, 2, 1],          // 内边距（左右2，上下1）
  getBackgroundColor: Ei[t],               // 背景色 = 等值线颜色（彩色）
  getBorderColor: [0, 0, 0, 255],          // 黑色边框
  getBorderWidth: 1,
  fontFamily: '"Helvetica Neue", Arial, Helvetica, sans-serif',
  fontWeight: 600,
  billboard: false,                         // 标注随视角倾斜（非广告牌模式）
})
```

**标注可见条件**：等值线开关启用 AND zoom >= 4（标注实际总是显示，因最小 zoom = 5）。

**标注效果**：彩色椭圆背景（颜色与对应等值线一致）+ 黑色文字 + 黑色细边框，标注随等值线方向旋转，每隔约 50 个坐标点出现一次。

---

## 七、参考截图

- `contour-img-a.png`：zoom=5，无等值线
- `contour-img-b.png`：zoom=5，等值线显示（彩色细线，无标注）
- `contour-img-b2.png`：zoom=5.5，等值线标注开始出现（彩色椭圆badge）
- `contour-img-c.png`：zoom=6，等值线标注完整可见
- `contour-img-d.png`：zoom=6，拖到西边界，可见格点数据边缘处等值线截断效果

---

## 八、改造建议

1. **换库**：`pnpm remove d3-contour && pnpm add marchingsquares`
2. **输入预处理**：将 flat array + header 转为 `data2D`（`number[][]`）
3. **调用**：`isoLines(data2D, thresholds, { noFrame: true, linearRing: false })`
4. **后处理**：merge → RDP（tolerance 0.1）→ Chaikin → 坐标变换
5. **可选**：迁移到 Web Worker（375 点计算 < 1ms，暂时主线程即可）

Chaikin 和 RDP 均可手写（各约 20 行），无需额外依赖。

---

## 九、高低点图层调研（F-23 参考）

### 算法流程

```
原始格点数据（flat array）
  ↓
1. 3×3 邻域均值平滑（消除单格点噪声）
  ↓
2. 8邻域比较找局部极值：
   - 高点：点值 ≥ 4个方向邻居 AND > 另4个方向邻居（混合条件，防平台区爆炸）
   - 低点：同理取反
  ↓
3. 按值排序（高点降序，低点升序）
  ↓
4. 最小间距过滤：遍历排好序的点，移除距离任意更高优先级点 < 1000×radius 米的点
   （radius 参数可配置，约 600~1000km 量级）
  ↓
5. 输出 GeoJSON FeatureCollection，每个点有 type:"H"/"L" 和 value 属性
```

> **与 cwrvis 设计方案的差异**：原方案是"top-3"固定筛选；对方是"全局极值 + 最小间距"筛选，更合理、更自适应数据分布。

### 渲染实现（deck.gl）

```js
// 两层 TextLayer：上层字母，下层数值
new TextLayer({
  id: "type",
  data: visiblePoints,
  getPosition: e => e.geometry.coordinates,
  getText: e => e.properties.type,   // "H" 或 "L"
  getSize: 1.2 * textSize,           // 字母比数值大 20%
  getPixelOffset: [0, -offset],      // 上移，位于数值上方
  getColor: e => palette(e.properties.value),  // 按值取色卡颜色（同格点图层）
  outlineWidth: 1,
  outlineColor: [13, 13, 13, 255],   // 深色描边
  fontFamily: "Helvetica Neue ...",
  fontWeight: 600,
  billboard: false,
  extensions: [new CollisionFilterExtension],  // ← 自动隐藏重叠标注
  collisionEnabled: true,
  getCollisionPriority: e => ...,    // H按超出均值幅度排优先级，L反之
})

new TextLayer({
  id: "value",
  getText: e => formatValue(e.properties.value),
  getSize: textSize,
  getPixelOffset: [0, +offset],      // 下移，位于字母下方
  // 其余同上
})
```

**颜色**：不是固定红/蓝，而是与格点图层共享同一色卡（palette），高值点自然得暖色（红/橙），低值点得冷色（蓝/紫）。

**碰撞检测**：`CollisionFilterExtension` 是 deck.gl 内置功能，自动计算屏幕空间碰撞并隐藏低优先级标注，无需手动控制密度。

### 参考截图

- `hlpt-img-a.png`：2020-01 高低点分布
- `hlpt-img-b.png`：2020-02 高低点分布（对比位置变化）
