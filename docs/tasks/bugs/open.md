# Bugs — Open

> 格式规范见 `docs/tasks/SCHEMA.md`。

---

## BUG-14 · `bilinearInterp` 格网参数硬编码

**发现时间**：2026-05-16
**严重程度**：Major
**重现步骤**：
1. 查看 `frontend/src/utils/grid.ts`
2. `bilinearInterp` 内 `gy = (lat - 39.5) / -1`、`gx = (lon - 75.5) / 1` 写死原点和步长
**期望行为**：从 `metaStore.grid.lat` / `metaStore.grid.lon` 动态读取
**实际行为**：换格网（不同分辨率或覆盖范围）时静默出错，不报异常
**相关文件**：`frontend/src/utils/grid.ts`，`frontend/src/composables/useGridLayer.ts`（调用方）

---

## BUG-15 · 点击格点图层边缘 0.5° 环返回 null（左/顶不对称）

**发现时间**：2026-05-16
**严重程度**：Minor
**重现步骤**：
1. 点击格点图层**左侧** 0.5° 环（lon ∈ [75.0, 75.5)）或**顶部** 0.5° 环（lat ∈ (39.5, 40.0]）
2. 该点通过 `isInGridBounds` 检查，但 `bilinearInterp` 计算得索引 < 0，直接 return null
**期望行为**：边缘点击应钳制到最近格点，返回合理插值
**实际行为**：左侧和顶部边缘 hover / PinTip 取值显示为空；右侧和底部边缘正常（已有 Math.min 上界钳制）
**根因补充**：`bilinearInterp` 第 14–15 行对上界（gx1/gy1）有 `Math.min` 钳制，但对下界（gx0/gy0）无对应处理。
- 左侧：`lon=75.0` → `gx=(75.0−75.5)/1=−0.5` → `gx0=−1` → null
- 顶部：`lat=40.0` → `gy=(40.0−39.5)/−1=−0.5` → `gy0=−1` → null
**相关文件**：`frontend/src/utils/grid.ts:bilinearInterp`

---

## BUG-16 · `isInGridBounds` 边界范围硬编码

**发现时间**：2026-05-16
**严重程度**：Minor
**重现步骤**：查看 `frontend/src/utils/grid.ts` 顶部 `GRID_BOUNDS` 常量
**期望行为**：边界范围从 `metaStore.grid.lat` / `metaStore.grid.lon` 动态计算（格点中心 ± 半步长）
**实际行为**：`{ latMin:25, latMax:40, lonMin:75, lonMax:100 }` 写死，换格网需手动同步
**相关文件**：`frontend/src/utils/grid.ts`，`frontend/src/components/modules/GridModule.vue`（调用方）

---

## BUG-17 · Canvas 尺寸硬编码且各向异性

**发现时间**：2026-05-16
**严重程度**：Minor
**重现步骤**：查看 `useMap.ts`（`canvas.width = 600; canvas.height = 400`）和 `useGridLayer.ts`（`targetW: 600, targetH: 400`）
**期望行为**：尺寸应由格网格点数动态计算：`width = nLon × k, height = nLat × k`，确保经纬向像素密度一致（各向同性）
**实际行为**：
- 600×400 = 3:2，而实际格网覆盖 25°×15° = 5:3，比例不符
- 经向约 24 像素/格点，纬向约 26.7 像素/格点，双线性插值各向异性
**相关文件**：`frontend/src/composables/useMap.ts`，`frontend/src/composables/useGridLayer.ts`

---

## BUG-18 · `bilinearInterp` 坐标映射与 Canvas 渲染不一致

**发现时间**：2026-05-16
**严重程度**：Minor
**重现步骤**：对同一地理坐标分别通过点击取值和观察 canvas 颜色比对
**期望行为**：hover/click 取值与 canvas 对应像素颜色映射同一数据值
**实际行为**：两者采用不同坐标映射：
- Canvas worker：`col = (lon - 75.0) × 24/25`（以单元格边界 75.0 为起点）
- `bilinearInterp`：`col = (lon - 75.5) / 1.0`（以格点中心 75.5 为起点）
- 在格网中心（lon=87.5）完全吻合，向边缘偏差最大约 **0.48 格点（≈0.48°）**
**相关文件**：`frontend/src/utils/grid.ts`，`frontend/src/composables/useGridLayer.ts`（worker 调用）

---

## BUG-19 · HistoryModal 逐月/逐年帧数硬编码

**发现时间**：2026-05-16
**严重程度**：Minor
**重现步骤**：
1. 查看 `frontend/src/components/modals/HistoryModal.vue` 第 47–48 行
2. `TABS` 数组中 `monthly: frames: 312`、`yearly: frames: 26` 写死
**期望行为**：帧数应从 metaStore 的时间元数据动态读取（数据集时间范围决定月帧数和年帧数）
**实际行为**：若数据集时间跨度变化（如从 312 个月扩展或缩短），UI 上显示的帧数标注不会更新，且任何依赖该字段的逻辑也会出错
**备注**：`avg_monthly: 12`（月平均按月分 12 组）和 `avg_season: 4`（季平均按季分 4 组）为领域常量，正确，不需修改
**相关文件**：`frontend/src/components/modals/HistoryModal.vue:47-48`

---

## BUG-20 · 快速拖拽时间轴后色卡量程固定为 [0, 1]

**发现时间**：2026-05-16
**严重程度**：Major
**重现步骤**：
1. 加载任意变量（CWR、RCh、RCv 均可复现）
2. 光标快速拖动时间轴滑块
3. 观察右下角图例色卡的最大最小值 → 在某种情况下变为 `[0, 1]`
**期望行为**：量程始终反映当前帧实际数据的值域
**实际行为**：
- 量程固定为 `[0, 1]`，持续到主动干预
- 一旦触发，切换上一帧/下一帧后量程仍保持 `[0, 1]`
- 点击换算为 mm 单位后量程恢复正常，再还原 kg 也正常；此后该帧及前后帧均恢复正常
**根因**：`sendToWorker` 可对同一 `frameKey` 向 Worker 发送两次渲染请求：
- `renderCurrent()`（cache miss）发送一次
- 紧随其后的 `preload()` 仅检查 `imageCache`（已完成渲染），不检查 `pendingRanges`（正在渲染），误判"未渲染"后再发一次
Worker 先后回应两次同一 `frameKey`：第一次响应从 `pendingRanges` 取到正确量程并 `.delete(frameKey)` 存入 imageCache；第二次响应 `pendingRanges.get(frameKey)` 返回 `undefined`，触发 `useGridLayer.ts:96` 的兜底 `{ vmin: 0, vmax: 1 }`，**覆盖** imageCache 中正确条目。此后该帧通过 `applyBitmap()` 每次都调用 `setRenderRange(0, 1)`，直到 `imageCache.clear()`（单位切换时触发）。
**相关文件**：
- `frontend/src/composables/useGridLayer.ts:96`（兜底 `{vmin:0, vmax:1}`）
- `frontend/src/composables/useGridLayer.ts:216-227`（`preload` 未检查 pendingRanges）
- `frontend/src/composables/useGridLayer.ts:198-214`（`renderCurrent` 与 preload 发送重复请求）
