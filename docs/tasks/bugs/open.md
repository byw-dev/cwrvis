# Bugs — Open

> 格式规范见 `docs/tasks/SCHEMA.md`。

---

## BUG-26 · `useXizangBoundary` GeoJSON 缓存未区分底图坐标系

**发现时间**：2026-05-19
**严重程度**：Minor
**重现步骤**：
1. 进入"空间分布"模块，边界线正常加载（例如 GCJ-02 底图）
2. 在设置中切换到 WGS-84 底图（或反之）
**期望行为**：底图切换后边界线坐标随之更新，与底图对齐
**实际行为**：GeoJSON 缓存 key 仅为 shape id，不含底图信息；首次加载后的坐标偏移（shiftCoords）被固化在缓存中，切换底图后边界线产生偏移（`useRegionLayer` 存在相同问题）
**相关文件**：`frontend/src/composables/useXizangBoundary.ts`（`loadGeo` 缓存逻辑）

---

## BUG-31 · 年平均表格加载中状态与"无数据"状态无法区分

**发现时间**：2026-05-19
**严重程度**：Minor
**重现步骤**：打开历史弹窗立即切换到"年平均" Tab（数据尚在请求中）
**期望行为**：展示明确的加载状态（如 loading 指示），与数据加载完成后值为 null 的情况区分
**实际行为**：`statsCache` 未命中时直接以 null 值渲染所有行（显示 `—`），与真正的"后端返回 null"视觉上无法区分，用户无法判断是加载中还是数据为空
**相关文件**：`frontend/src/components/modals/RegionHistoryModal.vue`（年平均表格渲染逻辑，约 123 行）

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
