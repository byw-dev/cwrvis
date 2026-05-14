# Bugs — Closed

> 格式规范见 `docs/tasks/SCHEMA.md`。

---

## BUG-01 · 开发环境 CORS 导致格点/区域数据无法加载

**发现时间**：2026-05-14（联调）
**严重程度**：Critical
**重现步骤**：
1. `make dev` 启动前后端
2. 浏览器打开 `localhost:5173`，控制台报 CORS 错误
**期望行为**：前端能正常请求 `/grid`、`/shapes`、`/api` 接口
**实际行为**：`Failed to fetch`，因前端直接访问绝对 URL 绕过 Vite proxy
**相关文件**：`frontend/vite.config.ts`、`frontend/.env.development`
**修复记录**：fd16f20 — 在 `vite.config.ts` 补 `/grid`、`/shapes` proxy，`.env.development` 改用相对路径

---

## BUG-02 · 格点叠加层初始不显示

**发现时间**：2026-05-14（联调）
**严重程度**：Critical
**重现步骤**：
1. 页面加载完成后选择任意 var
2. 地图上没有任何格点色块叠加
**期望行为**：地图加载完毕后自动渲染当前 var 的格点色卡
**实际行为**：`{ immediate: true }` watch 在地图初始化前触发，数据加载完时地图尚未 ready
**相关文件**：`frontend/src/composables/useGridLayer.ts`
**修复记录**：fd16f20 — 补加 map ready watcher，在 `map.isStyleLoaded()` 或 `map.once('load')` 后重渲

---

## BUG-03 · 模块切换后格点图层消失（Chrome GPU canvas 问题）

**发现时间**：2026-05-14（联调）
**严重程度**：Critical
**重现步骤**：
1. 格点数据模块正常显示图层
2. 切换到区域统计模块再切回格点数据
3. 图层消失，地图空白
**期望行为**：模块切换不影响格点图层
**实际行为**：`ctx.drawImage(ImageBitmap)` 导致 Chrome 将 canvas GPU 加速，`texImage2D` 读到 CPU buffer 全零
**相关文件**：`frontend/src/workers/gridRenderer.worker.ts`、`frontend/src/composables/useGridLayer.ts`
**修复记录**：
- 97227ef / 88970b4 — 多次尝试 play/pause/rAF 方案均失败
- fcd90f9 — **根本修复**：Worker 改为传输原始 `ArrayBuffer` 像素，主线程用 `ctx.putImageData()` 写入，彻底绕开 GPU-backed canvas 问题（详见 `docs/design/frontend.md` § Canvas 渲染方案）

---

## BUG-04 · hover tooltip 数值始终显示 N/D

**发现时间**：2026-05-14（联调）
**严重程度**：Major
**重现步骤**：鼠标移入格点图层区域，tooltip 显示 `N/D kg`
**期望行为**：显示该坐标插值数值
**实际行为**：`isInGridBounds()` 检查和双线性插值未在 hover 路径上正确接入
**相关文件**：`frontend/src/components/modules/GridModule.vue`、`frontend/src/utils/grid.ts`
**修复记录**：53b878f — 新建 `utils/grid.ts`（`isInGridBounds`、`bilinearInterp`），在 `onMouseMove` 中调用

---

## BUG-05 · var 切换后已选中坐标点数值不更新

**发现时间**：2026-05-14（联调）
**严重程度**：Major
**重现步骤**：
1. 点击地图选中一个格点（Inspector 显示数值）
2. 切换到其他 var
3. Inspector 仍显示上一个 var 的数值或 N/D
**期望行为**：var 切换后 Inspector 显示新 var 在该坐标的数值
**实际行为**：watch `varStore.selVar` 时新数据尚未加载，读到 null
**相关文件**：`frontend/src/components/modules/GridModule.vue`
**修复记录**：87bfa5c — 将 watch 从 `varStore.selVar` 改为 `renderTick`，确保在新 var 数据渲染完毕后再读值

---

## BUG-06 · 区域统计模块多项问题

**发现时间**：2026-05-14（联调）
**严重程度**：Major
**问题列表**：
1. 进入区域统计模块后右侧图例消失（`.right-panel` 无 CSS）
2. 鼠标 hover 区域无 tooltip 显示区域名称
3. 区域选择 UI 高亮圆点固定在"西藏自治区"，不跟随选中
4. 切换模块后区域高亮效果不清除
**相关文件**：`frontend/src/components/modules/RegionModule.vue`、`frontend/src/components/layout/SubToolbar.vue`
**修复记录**：9012d7d — 补充 `.right-panel` 布局 + Legend 组件、`hoverInfo` tooltip、区域圆点条件渲染、`teardown()` 清除 region layer

---

## BUG-07 · 历史图表 Y 轴溢出、markLine 标签显示索引序号

**发现时间**：2026-05-14（联调）
**严重程度**：Major
**问题列表**：
1. kg 单位 Y 轴显示完整数字（如 `1380000000000`），溢出弹窗左边界
2. 黄色竖线顶部显示索引序号（如 `74`）而非 X 轴分类标签（如 `2006-03`）
3. 区域历史弹窗 tooltip hover 时大数值无格式化
**相关文件**：`frontend/src/components/modals/HistoryModal.vue`、`frontend/src/components/modals/RegionHistoryModal.vue`
**修复记录**：
- 5454ccf — Y 轴加 `formatter` 科学计数法、markLine 改用 `name + '{b}'`、补注册 `GraphicComponent`、`containLabel: true`
- 7113e3a — 格点历史弹窗 markLine 改为虚线（与区域模块一致）

---

## BUG-08 · 图例面板被底部时间轴遮挡

**发现时间**：2026-05-14（联调）
**严重程度**：Major
**重现步骤**：正常加载页面，右下角图例下半截被底部 BottomBar 盖住
**期望行为**：图例完整显示在底部时间轴上方
**实际行为**：`.right-panel` 的 `bottom: 52px` 硬编码值小于底部栏实际高度（86px）
**相关文件**：`frontend/src/components/modules/GridModule.vue`、`frontend/src/components/modules/RegionModule.vue`
**修复记录**：ae69223 — `bottom: 52px` → `bottom: var(--h-bottom)`，后续改为 `calc(var(--h-bottom) + 0.75rem)`

---

## BUG-09 · 区域历史弹窗多 Y 轴叠在一起

**发现时间**：2026-05-14（联调）
**严重程度**：Major
**重现步骤**：区域历史弹窗中添加不同单位的 var（如 kg + % + day）
**期望行为**：不同单位的 Y 轴各自向右平铺
**实际行为**：所有右侧 Y 轴 offset 相同，刻度数字完全重叠
**相关文件**：`frontend/src/components/modals/RegionHistoryModal.vue`
**修复记录**：40277ff / 1fec6c9 — 重构 Y 轴布局：kg 固定左轴，非 kg 依次右移 `AXIS_W` px；单位标签改 `nameLocation: end`；图例移至底部；模态框宽度动态绑定

---

## BUG-10 · 折线 hover 离开后 tooltip 未恢复默认状态

**发现时间**：2026-05-14（联调）
**严重程度**：Minor
**重现步骤**：在区域历史弹窗中 hover 某条折线，然后移到空白区域，tooltip 仍高亮上一条线
**期望行为**：鼠标离开折线后所有系列恢复等权显示
**实际行为**：`hoveredSeries` 只在 `globalout`（鼠标离开图表整体）时清除
**相关文件**：`frontend/src/components/modals/RegionHistoryModal.vue`
**修复记录**：1e0689f — 补加 `mouseout` 监听 + 30ms 防抖，避免跨系列移动时闪烁

---

## BUG-11 · 播放速度档标签被错误减半

**发现时间**：2026-05-14
**严重程度**：Minor
**重现步骤**：底部时间轴速度按钮显示 `0.25×`、`0.5×`、`1×`、`2×`
**期望行为**：`0.5×`、`1×`、`2×`、`4×`（原始标签），1× = 1000ms/帧
**实际行为**：`SPEEDS` 数组被错误地从 `[0.5,1,2,4]` 改为 `[0.25,0.5,1,2]`
**相关文件**：`frontend/src/components/layout/BottomBar.vue`
**修复记录**：b121b2e — 还原 `SPEEDS = [0.5, 1, 2, 4]`，保留基准 1000ms/帧
