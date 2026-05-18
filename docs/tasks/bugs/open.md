# Bugs — Open

> 格式规范见 `docs/tasks/SCHEMA.md`。

---

## BUG-22 · 年平均表格 kg→mm 开关在当前变量为非 kg 时被隐藏

**发现时间**：2026-05-19
**严重程度**：Minor
**重现步骤**：
1. 在区域评估模块，将当前变量切换为非 kg 变量（如 CEv、PEh）
2. 打开历史弹窗 → 切换到"年平均" Tab
3. 表格包含所有 15 个变量（含 11 个 kg 变量）
**期望行为**：kg→mm 开关始终可见，允许对表格中的 kg 行进行单位换算
**实际行为**：开关的显示条件为 `v-if="anyKgVar && area_m2 !== null"`，而 `anyKgVar` 取决于当前 `activeVars`（当前已选变量）；当前变量为非 kg 时，`anyKgVar` 为 false，开关被隐藏，用户无法切换年平均表格的单位
**相关文件**：`frontend/src/components/modals/RegionHistoryModal.vue`（kg→mm 按钮 `v-if` 条件，约 393 行）

---

## BUG-23 · CSV 导出在数据未加载时静默输出仅含表头的空文件

**发现时间**：2026-05-19
**严重程度**：Minor
**重现步骤**：
1. 打开区域历史弹窗，立即点击"⬇ 导出 CSV"（数据可能尚未加载完成），或切换到尚未请求过的 Tab 后立即导出
**期望行为**：数据未就绪时禁用导出按钮或提示加载中；导出失败时给出明确反馈
**实际行为**：`getCached` 返回 null 时回退为空数组，直接生成仅含表头的 CSV 文件并下载，用户无法察觉数据为空
**相关文件**：`frontend/src/components/modals/RegionHistoryModal.vue`（CSV 导出逻辑，约 341 行）

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
