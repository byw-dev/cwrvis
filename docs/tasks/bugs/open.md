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

## BUG-27 · RegionHistoryModal 点击图表跳帧时 goToIndex 在 setMode 之前调用

**发现时间**：2026-05-19
**严重程度**：Minor
**重现步骤**：
1. 当前时间模式为"逐月"，打开历史弹窗切换到"逐年" Tab
2. 点击逐年折线图上的某数据点
**期望行为**：主地图跳转到对应年份的逐年帧
**实际行为**：`timeStore.goToIndex(params.dataIndex)` 在 `timeStore.setMode(mode)` 之前执行，以旧 mode（逐月）的帧列表解释 dataIndex，导致跳转到错误的年月帧
**相关文件**：`frontend/src/components/modals/RegionHistoryModal.vue`（图表 click handler，约 50 行）

---

## BUG-28 · HelpModal 未做焦点管理，键盘用户可 Tab 到遮罩后的控件

**发现时间**：2026-05-19
**严重程度**：Minor
**重现步骤**：打开帮助弹窗，使用键盘 Tab 键导航
**期望行为**：焦点应移入弹窗并被限制在弹窗内，关闭后焦点回到触发按钮
**实际行为**：弹窗打开后焦点未移入，键盘用户可 Tab 到遮罩后的地图控件；弹窗标注了 `aria-modal` 但无焦点陷阱实现
**相关文件**：`frontend/src/components/modals/HelpModal.vue`

---

## BUG-29 · ExportModule 进度条定时器在组件卸载时未清除

**发现时间**：2026-05-19
**严重程度**：Minor
**重现步骤**：触发报告下载后立即切换到其他模块
**期望行为**：组件卸载时清除进度条 interval，并中止或忽略进行中的请求
**实际行为**：`setInterval` 仅在下载 Promise 完成时清除；组件卸载后 interval 仍在运行，持续更新已卸载组件的响应式状态
**相关文件**：`frontend/src/components/modules/ExportModule.vue`（进度条 interval 逻辑，约 68 行）

---

## BUG-30 · HelpModal 全局 Escape 监听与 GridModule 的 Escape 处理冲突

**发现时间**：2026-05-19
**严重程度**：Minor
**重现步骤**：
1. 在"空间分布"模块点击地图选取一个格点（Inspector 出现）
2. 打开帮助弹窗，按 Esc 关闭
**期望行为**：Esc 仅关闭帮助弹窗，不影响格点选取状态
**实际行为**：两者都全局监听 `keydown`，Esc 同时触发弹窗关闭和 GridModule 的 `clearPick()`，导致关闭帮助弹窗时意外清除已选取值点
**相关文件**：`frontend/src/components/modals/HelpModal.vue`（`onKeydown`）、`frontend/src/components/modules/GridModule.vue`（`onKeydown`）

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
