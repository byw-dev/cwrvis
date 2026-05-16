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
