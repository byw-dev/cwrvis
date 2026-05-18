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

---

## BUG-12 · kg→mm 切换后格点图层冻结

**发现时间**：2026-05-15
**严重程度**：Critical
**重现步骤**：
1. 在格点数据模块，选择 kg 单位变量（如 CWR）
2. 点击图例中的"点击以换算为 mm"切换按钮
3. 尝试切换时间帧或播放
**期望行为**：图层随帧正常更新，颜色随 mm 换算值变化
**实际行为**：图层固定不变，帧切换无响应
**相关文件**：`frontend/src/composables/useGridLayer.ts:183`
**修复记录**：5e1746c — 引入 `toRaw()` 对 `metaStore.grid.dxy` 解包后再 `postMessage`，避免 Vue Proxy 导致的 `DataCloneError`

---

## BUG-13 · 格点 hover / PinTip / Inspector 坐标仅 1 位小数

**发现时间**：2026-05-15
**严重程度**：Minor
**重现步骤**：
1. 在格点数据模块，鼠标悬停或点击地图上任意格点
2. 观察 HoverTooltip / PinTip / Inspector 显示的经纬度坐标
**期望行为**：显示 3 位小数，如 `32.509°N 87.750°E`
**实际行为**：仅 1 位小数，如 `32.5°N 87.8°E`，精度不足
**相关文件**：`frontend/src/components/map/HoverTooltip.vue:17`、`frontend/src/components/map/PinTip.vue:22`、`frontend/src/components/panels/Inspector.vue:24`
**修复记录**：5e1746c — 三处 `toFixed(1)` 统一改为 `toFixed(3)`

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
**出现原因**：初期开发时格网固定为 1°×1°，直接把起点坐标和步长硬编码在函数体内，未预留动态参数接口。
**修复方案**：`bilinearInterp` 改为接收 `lats: number[], lons: number[]` 参数，步长从 `lons[1]-lons[0]` / `lats[1]-lats[0]` 动态计算，所有调用方同步传入 `metaStore.grid.lat/lon`。
**修复记录**：6fe1c95 — fix(frontend): BUG-14 BUG-15 BUG-16 BUG-17 格点坐标动态化与 canvas 各向同性

---

## BUG-15 · 点击格点图层边缘 0.5° 环返回 null（左/顶不对称）

**发现时间**：2026-05-16
**严重程度**：Minor
**重现步骤**：
1. 点击格点图层**左侧** 0.5° 环（lon ∈ [75.0, 75.5)）或**顶部** 0.5° 环（lat ∈ (39.5, 40.0]）
2. 该点通过 `isInGridBounds` 检查，但 `bilinearInterp` 计算得索引 < 0，直接 return null
**期望行为**：边缘点击应钳制到最近格点，返回合理插值
**实际行为**：左侧和顶部边缘 hover / PinTip 取值显示为空；右侧和底部边缘正常
**相关文件**：`frontend/src/utils/grid.ts:bilinearInterp`
**出现原因**：旧实现对上界（gx1/gy1）有 `Math.min` 钳制，但对下界无对应 `Math.max`，导致左/顶半格单元内的点击产生负索引后直接返回 null，表现不对称。
**修复方案**：在 floor 之前先将 gx/gy 钳制到 `[0, n-1]`（`gxc = Math.max(0, Math.min(nLon-1, gx))`），使外侧半格单元内的点击返回最近边缘格点的插值，而非 null。
**修复记录**：6fe1c95 — fix(frontend): BUG-14 BUG-15 BUG-16 BUG-17 格点坐标动态化与 canvas 各向同性

---

## BUG-16 · `isInGridBounds` 边界范围硬编码

**发现时间**：2026-05-16
**严重程度**：Minor
**重现步骤**：查看 `frontend/src/utils/grid.ts` 顶部 `GRID_BOUNDS` 常量
**期望行为**：边界范围从 `metaStore.grid.lat` / `metaStore.grid.lon` 动态计算（格点中心 ± 半步长）
**实际行为**：`{ latMin:25, latMax:40, lonMin:75, lonMax:100 }` 写死，换格网需手动同步
**相关文件**：`frontend/src/utils/grid.ts`，`frontend/src/components/modules/GridModule.vue`（调用方）
**出现原因**：与 BUG-14 同源，格网参数全部硬编码。
**修复方案**：新增 `computeGridBounds(lats, lons)` 函数（格点中心 ± 半步长），`isInGridBounds` 改为接收 `lats/lons` 参数并调用 `computeGridBounds`；调用方传入 `metaStore.grid?.lat ?? []`。
**修复记录**：6fe1c95 — fix(frontend): BUG-14 BUG-15 BUG-16 BUG-17 格点坐标动态化与 canvas 各向同性

---

## BUG-17 · Canvas 尺寸硬编码且各向异性

**发现时间**：2026-05-16
**严重程度**：Minor
**重现步骤**：查看 `useMap.ts`（`canvas.width = 600; canvas.height = 400`）和 `useGridLayer.ts`（`targetW: 600, targetH: 400`）
**期望行为**：尺寸应由格网格点数动态计算：`width = nLon × k, height = nLat × k`，确保经纬向像素密度一致（各向同性）
**实际行为**：600×400 = 3:2，实际格网 25×15 = 5:3，比例不符；经向约 24 px/格点，纬向约 26.7 px/格点
**相关文件**：`frontend/src/composables/useMap.ts`，`frontend/src/composables/useGridLayer.ts`
**出现原因**：Canvas 尺寸与 Worker targetW/targetH 均在开发期直接写死，未考虑格网比例与可变格网的情况。
**修复方案**：新增 `computeGridScale(nLon, nLat)` 函数（`k = floor(sqrt(400000/(nLon*nLat)))`，钳制在 [10,48]），canvas 尺寸改为 `nLon×k × nLat×k`；Worker targetW/targetH 同步使用相同公式。Overlay 四角坐标改从 `computeGridBounds` 动态计算，meta 就绪后通过 `watch` + `setCoordinates` 自动修正竞态。当前格网（25×15）对应 k=32，canvas 800×480。
**技术决策**：canvas 尺寸在 `initMap` 时确定后不可动态调整（MapLibre canvas source 限制）；meta 未就绪时使用与当前数据集匹配的 fallback 默认值（25×15），overlay 坐标支持事后更新。
**修复记录**：6fe1c95 — fix(frontend): BUG-14 BUG-15 BUG-16 BUG-17 格点坐标动态化与 canvas 各向同性

---

## BUG-19 · HistoryModal 逐月/逐年帧数硬编码

**发现时间**：2026-05-16
**严重程度**：Minor
**重现步骤**：
1. 查看 `frontend/src/components/modals/HistoryModal.vue` 第 47–48 行
2. `TABS` 数组中 `monthly: frames: 312`、`yearly: frames: 26` 写死
**期望行为**：帧数应从 metaStore 的时间元数据动态读取
**实际行为**：数据集时间跨度变化时，UI 帧数标注不会更新
**备注**：`avg_monthly: 12` 和 `avg_season: 4` 为领域常量，正确，不修改
**相关文件**：`frontend/src/components/modals/HistoryModal.vue:47-48`
**出现原因**：TABS 以 const 数组定义，帧数在模块初始化时即固化，未接入响应式数据源。
**修复方案**：将 `const TABS` 改为 `computed`，monthly/yearly 的 `frames` 字段分别取 `metaStore.timeline?.month.length` 和 `year.length`；脚本中三处 `.find()` 改为 `.value.find()`，模板无需改动（computed 自动展开）。
**修复记录**：ef3c7f8 — fix(frontend): BUG-19 HistoryModal tab 帧数从 metaStore.timeline 动态读取

---

## BUG-20 · 快速拖拽时间轴后色卡量程固定为 [0, 1]

**发现时间**：2026-05-16
**严重程度**：Major
**重现步骤**：
1. 加载任意变量（CWR、RCh、RCv 均可复现）
2. 光标快速拖动时间轴滑块
3. 观察右下角图例色卡的最大最小值 → 在某种情况下变为 `[0, 1]`
**期望行为**：量程始终反映当前帧实际数据的值域
**实际行为**：量程固定为 `[0, 1]`，持续到主动干预（切换单位可临时恢复）
**相关文件**：`frontend/src/composables/useGridLayer.ts`
**出现原因**：`sendToWorker` 对同一 `frameKey` 可能被 `renderCurrent()` 和 `preload()` 各投递一次（preload 仅检查 `imageCache` 是否存在，不检查是否正在渲染）。第一次 Worker 响应正常写入 `imageCache` 并删除 `pendingRanges` 条目；第二次响应时条目已被删，回退到兜底 `{vmin:0, vmax:1}`，覆盖了正确缓存。
**修复方案**：新增模块级 `pendingKeys: Set<string>`，`sendToWorker` 投递前若 key 已在集合中则直接 return；投递后加入集合，Worker 响应后移除。`imageCache.clear()` 时同步清空 `pendingKeys` 和 `pendingRanges`。
**修复记录**：bf660cb — fix(frontend): BUG-20 pendingKeys Set 防止重复渲染污染 imageCache

---

## BUG-21 · 格点季平均（mean_season）对 kg 变量计算逻辑错误，结果偏低约 3 倍

**发现时间**：2026-05-18
**严重程度**：Major
**重现步骤**：在"空间分布"模块切换至"季平均"聚合模式，查看任意 kg 单位变量（如 SP、CWR），与区域评估模块季平均数值对比
**期望行为**：格点季平均 = 先对每年季节内月份 SUM，再跨年 nanmean（与后端 SQL 两步聚合一致）
**实际行为**：直接对所有年同季月份取 nanmean，等价于月均值，kg 变量结果偏低约 3 倍
**受影响变量**：kg 单位变量（11 个）：SP、CWR、GMv、GMh、aveMv、aveMh、INv、OTv、INh、OTh、MC；`%`/`day`/`hour` 变量不受影响
**相关文件**：`scripts/netcdf_to_json.py`
**出现原因**：`_compute_means` 的 `mean_season` 分支对所有变量统一用 `np.nanmean`，未区分累计量（kg，应先季内 SUM 再跨年 AVG）与状态量（可直接 AVG），与后端 SQL 两步聚合逻辑不一致
**修复方案**：新增 `units_map` 参数，kg 变量按年对季节内月份 `nansum` 后再跨年 `nanmean`；非 kg 变量保持直接 `nanmean`（数学等价）；units 从 netcdf 属性读取，不硬编码。修复后需重新运行 `make data-grid` 重生成 `static/grid/mean_season/` 数据
**技术决策**：units 来源选择 netcdf 文件属性而非硬编码列表，保持脚本与数据源自洽，避免与 `backend/config.py` 的 KG_VARS 产生两处维护点
**修复记录**：9512422 — fix(scripts): BUG-21 格点季平均 kg 变量改为两步聚合

---

## BUG-24 · `useXizangBoundary` initLayers 在组件卸载后仍可执行

**发现时间**：2026-05-19
**严重程度**：Minor
**重现步骤**：进入"空间分布"模块，网络较慢时立即切换到其他模块；GeoJSON 异步加载完成后边界图层仍被加入地图
**期望行为**：组件卸载后 initLayers 不再操作地图
**实际行为**：`initLayers` 为异步函数，`onUnmounted` 调用 `hideLayers` 时 `layersAdded` 仍为 false，无法拦截；GeoJSON 加载完成后图层照常添加
**相关文件**：`frontend/src/composables/useXizangBoundary.ts`
**出现原因**：异步函数中 await 之后的代码不受 onUnmounted 同步拦截影响，需在异步续体内显式检查组件是否仍活跃
**修复方案**：新增实例级 `let active = true` 标志；onUnmounted 时先置 `false` 再调用 hideLayers；initLayers 在入口及 await 完成后各检查一次，任一为 false 则提前返回
**修复记录**：35b4185 — fix(frontend): BUG-24 useXizangBoundary 防卸载后 initLayers 异步续体操作地图

---

## BUG-25 · mean_season 两步聚合中 `nansum` 对全 NaN 格点返回 0

**发现时间**：2026-05-19
**严重程度**：Minor
**重现步骤**：数据集中某格点某季节所有月份均为 NaN（缺测），查看该格点季平均值
**期望行为**：全 NaN 输入的季节聚合结果保持 NaN，与后端 SQL NULL 行为一致
**实际行为**：`np.nansum` 对全 NaN 切片返回 0.0，导致无数据格点被赋值 0
**相关文件**：`scripts/netcdf_to_json.py`（BUG-21 修复引入）
**出现原因**：numpy 的 `nansum` 设计上对全 NaN 输入返回 0，需额外判断后替换为 NaN
**修复方案**：用 `np.where(np.all(np.isnan(arr), axis=0), np.nan, np.nansum(arr, axis=0))` 替代裸 `nansum`，全 NaN 格点直接填 NaN。修复后需重新运行 `make data-grid`
**修复记录**：cabfff9 — fix(scripts): BUG-25 mean_season 季节聚合全 NaN 格点保持 NaN

---

## BUG-22 · 年平均表格 kg→mm 开关在当前变量为非 kg 时被隐藏

**发现时间**：2026-05-19
**严重程度**：Minor
**重现步骤**：当前变量为非 kg 时打开历史弹窗 → 年平均 Tab，kg→mm 开关消失
**期望行为**：年平均 Tab 始终显示 kg→mm 开关（表格含全部 15 个变量）
**实际行为**：`v-if="anyKgVar"` 依赖当前选中变量，非 kg 变量时为 false，开关被隐藏
**相关文件**：`frontend/src/components/modals/RegionHistoryModal.vue`
**出现原因**：`anyKgVar` 基于 `activeVars`（图表已选变量）设计，未考虑年平均 Tab 渲染全量变量的场景
**修复方案**：将按钮 `v-if` 改为 `(isAvgYearly || anyKgVar) && area_m2 !== null`，年平均 Tab 始终满足条件
**修复记录**：5f5f5bd — fix(frontend): BUG-22 BUG-23 BUG-27 RegionHistoryModal 三项修复

---

## BUG-23 · CSV 导出在数据未加载时静默输出仅含表头的空文件

**发现时间**：2026-05-19
**严重程度**：Minor
**重现步骤**：切换到未加载过的 Tab 后立即点击"导出 CSV"
**期望行为**：数据未就绪时禁用导出按钮
**实际行为**：`getCached` 返回 null 被 `??[]` 降级为空数组，静默生成仅含表头的文件
**相关文件**：`frontend/src/components/modals/RegionHistoryModal.vue`
**出现原因**：exportCsv 未区分"未加载"和"空数据"两种状态
**修复方案**：新增 `csvDataReady` computed（检查当前 Tab 缓存是否非 null），按钮加 `:disabled="!csvDataReady"` 及禁用样式
**修复记录**：5f5f5bd — fix(frontend): BUG-22 BUG-23 BUG-27 RegionHistoryModal 三项修复

---

## BUG-27 · RegionHistoryModal 点击图表跳帧时 goToIndex 在 setMode 之前调用

**发现时间**：2026-05-19
**严重程度**：Minor
**重现步骤**：当前为逐月模式，历史弹窗切到逐年 Tab 后点击折线图数据点
**期望行为**：主地图切换到对应年份的逐年帧
**实际行为**：以旧 mode（逐月）的帧列表解释 dataIndex，跳转到错误帧
**相关文件**：`frontend/src/components/modals/RegionHistoryModal.vue`
**出现原因**：click handler 先调用 `goToIndex`（以当前 mode 解释索引），再调用 `setMode`，顺序颠倒
**修复方案**：重排为先 `setMode(mode)` 再 `goToIndex(params.dataIndex)`，并仅在 item 存在时执行
**修复记录**：5f5f5bd — fix(frontend): BUG-22 BUG-23 BUG-27 RegionHistoryModal 三项修复

---

## BUG-29 · ExportModule 进度条定时器在组件卸载时未清除

**发现时间**：2026-05-19
**严重程度**：Minor
**重现步骤**：触发报告下载后立即切换到其他模块
**期望行为**：组件卸载时清除进度条 interval
**实际行为**：`clearInterval` 仅在下载 Promise 完成时执行，卸载后 interval 持续运行
**相关文件**：`frontend/src/components/modules/ExportModule.vue`
**出现原因**：未注册 `onUnmounted` 清理钩子
**修复方案**：新增 `onUnmounted(() => { if (_timer) { clearInterval(_timer); _timer = null } })`
**修复记录**：f1d7d8a — fix(frontend): BUG-29 ExportModule 组件卸载时清除进度条定时器

---

## BUG-30 · HelpModal 全局 Escape 监听与 GridModule 的 Escape 处理冲突

**发现时间**：2026-05-19
**严重程度**：Minor
**重现步骤**：在空间分布模块选取格点后打开帮助弹窗，按 Esc 关闭
**期望行为**：Esc 仅关闭帮助弹窗
**实际行为**：同时触发 GridModule 的 clearPick()，意外清除已选取值点
**相关文件**：`frontend/src/components/modals/HelpModal.vue`
**出现原因**：两者均在 window 上以冒泡阶段注册 keydown 监听；GridModule 先注册故先执行，`stopImmediatePropagation` 对已执行的处理器无效
**修复方案**：HelpModal 改用捕获阶段（`addEventListener('keydown', handler, true)`）；捕获阶段先于冒泡阶段执行，`stopImmediatePropagation` 可阻止 GridModule 的冒泡阶段处理器运行
**修复记录**：444326f — fix(frontend): BUG-30 改用捕获阶段注册 Escape 监听，确保先于 GridModule 处理
