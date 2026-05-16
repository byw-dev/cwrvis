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

## BUG-15 · 点击格点图层边缘 0.5° 环返回 null

**发现时间**：2026-05-16
**严重程度**：Minor
**重现步骤**：
1. 点击格点图层最外侧 0.5° 区域（如 lon ∈ [75.0, 75.5)）
2. 该点通过 `isInGridBounds` 检查（范围为 [75.0, 100.0]），但 `bilinearInterp` 计算得 gx < 0，直接 return null
**期望行为**：边缘点击应钳制到最近格点，返回合理插值
**实际行为**：hover / PinTip 取值显示为空
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
