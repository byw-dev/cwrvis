# Bugs — Open

> 格式规范见 `docs/tasks/SCHEMA.md`。

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
