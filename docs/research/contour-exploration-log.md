# 等值线 / 高低点攻坚日志（F-22 / F-23）

> 记录 feature/F-22-contour 分支的完整探索过程、技术难点与当前遗留状态。
> 归档于 `archive/F-22-contour-v1`，未来继续时以此为起点。

---

## 一、目标

在格点图层上叠加等值线（F-22），视觉效果参考 `cwr.cheeroi.com`：
- 等值线平滑、与图层颜色梯度吻合
- 彩色线条（每条阈值一种颜色）+ 数值标注
- 格点边缘不截断，不出现沿边界走的毛刺

高低点（F-23）及格点数值标注（F-24）列入同分支但尚未攻坚。

---

## 二、调研结论（参考站 cwr.cheeroi.com）

详见 `docs/research/contour-research.md`，核心要点：

- **库**：MarchingSquaresJS v1.3.3，`isoLines(data2D, thresholds, { noFrame: true, linearRing: false })`
- **后处理**：merge 合并短段 → RDP 化简 → Chaikin 平滑（参考站选择了这条路，但参考站格网是 71×41，远比我们 25×15 密）
- **渲染**：deck.gl PathLayer + TextLayer（有 `CollisionFilterExtension` 自动避让）
- **标注**：彩色胶囊背景 + 黑色文字 + 黑色细边框，每 50 个坐标点放一个标注

---

## 三、实现过程与技术演进

### 3.1 初始方案（d3-contour，失败）

最初用 d3-contour。d3-contour 返回 MultiPolygon，没有原生的"不画边界框"选项，事后裁剪边界段极为复杂，已放弃。

### 3.2 换用 MarchingSquaresJS（基础跑通）

- 用 `marchingsquares` 替换 d3-contour
- `noFrame: true` 原生阻止沿矩形边界闭合
- 实现 `mergeSegments`（O(n²) 端点拼接）、RDP（tolerance=0.1）、Chaikin
- MapLibre GeoJSON source + line layer + symbol layer（`symbol-placement: 'line'`）

**遗留问题**：等值线在格点图层边缘"提前消失"约 0.5°。

### 3.3 定位边界消失问题

**根因**：`useMap.ts` 中 canvas 的地理覆盖范围是单元格边界 `[75.0, 100.0] × [25.0, 40.0]`（外扩半格），而等值线坐标只覆盖格点中心 `[75.5, 99.5] × [25.5, 39.5]`，边缘差 0.5°。

**修复**：坐标变换时，凡落在上采样格网边界的端点，额外向外延伸 `lonStep/2`（= 0.5°），对齐 canvas 扩边。

### 3.4 发现等值线与色彩显示不匹配

**根因**：
- 格点图层 canvas 是 15×25 数据双线性插值后得到的 800×480 像素图（另见 BUG-17）
- 等值线在原始 15×25 格网上运行 Marching Squares，仅 14×24 = 336 个方格
- 两者基于同一数据但计算分辨率相差约 36 倍，等值线明显比色彩"粗"

### 3.5 双线性上采样（部分改善，仍有折角）

在送入 Marching Squares 前，先把 15×25 双线性插值上采样到 769×449（k=32，与 canvas 倍率相同）。Marching Squares 方格数从 336 增至 344k，线条精细度大幅提升。

**但仍有折角**：双线性插值是 C⁰ 连续（函数值连续，一阶导数不连续），在每个原始 1° 格点边界处梯度方向突变，Marching Squares 忠实提取了这些折角。

用 Chaikin 磨圆可以缓解，但不能消除——k 再大也治标不治本。

### 3.6 换用双三次上采样（Catmull-Rom，当前方案）

用 Catmull-Rom 双三次插值替换双线性：C¹ 连续（一阶导数连续），格点边界处无梯度突变，Marching Squares 提取的等值线无折角。

由于 bicubic 本身导数连续，无需靠高密度摊平折角，scale 从 k=32 降至 k=16（约原来 1/4 计算量），上采样到 385×225（86k 方格）。Chaikin 同步去掉（不再需要）。

**当前代码状态**：
- `useContourLayer.ts`（新文件）：完整的等值线计算与渲染流水线
- 双三次上采样 → Marching Squares（noFrame:true）→ mergeSegments → 同侧边界 U 形过滤 → RDP → 坐标变换 + 边界延伸
- MapLibre line layer（彩虹色，hsl 80% lightness，50% saturation）+ symbol layer（沿线数值标注，深色 halo）
- Legend 面板底部"等值线"开关按钮
- 帧切换、kg↔mm、量程变更均自动重算

---

## 四、当前遗留难点

### 4.1 标注样式未完成

参考站使用 deck.gl TextLayer，实现彩色胶囊背景（背景色 = 线色，黑字，黑边框）。

我们目前用 MapLibre 原生 symbol layer，只能做文字 + halo，无法原生实现胶囊背景。可选方案：
1. MapLibre：宽 halo 近似（黑字 + 彩色宽 halo），效果约 70%，无需新依赖
2. 引入 deck.gl（~500KB bundle，架构复杂度提升），高低点 F-23 也会用到，两个功能一起引入更合算

**建议**：等 F-23 确认引入 deck.gl 时，F-22 标注一并迁移到 deck.gl TextLayer。

### 4.2 等值线与色彩图层存在系统性偏差

canvas 使用的双线性插值映射方式与 `bilinearInterp`（取值工具）的映射方式不完全相同：
- canvas：`col = (lon - 75.0) × 24/25`（单元格边界起点）
- bilinearInterp：`col = (lon - 75.5) / 1.0`（格点中心起点）

两者在格网中心（lon=87.5）完全吻合，向边缘偏差最大约 0.48 格点（≈0.48°）。等值线也存在类似偏差（bikubic 与 canvas 双线性起点不同）。对 1° 格网的气象数据视觉影响可接受，但理论上不一致。见 BUG-18。

### 4.3 彩虹色偏淡

当前 HSL 参数：色相均匀分布，饱和度 50%，亮度 **80%**。在深色地图背景上偏白，辨识度不足。调低亮度至 60%–65% 可显著改善，但未实测。

### 4.4 高低点（F-23）未开始

调研已完成（见 `contour-research.md` 第九节），算法和渲染方案已明确，代码未写。

---

## 五、推荐的继续切入点

1. **引入 deck.gl**：F-22 标注 + F-23 高低点共同触发，bundle 增量只付一次
2. **调低彩虹色亮度至 65%**：一行改动，视觉提升明显
3. **修复 BUG-14 ~ BUG-18**（已在 open.md 登记），其中 BUG-17/18 影响等值线准确性
4. 参考站高低点实现：3×3 均值平滑 → 8 邻域极值 → 最小间距过滤（优于当前设计的 top-3 固定策略）

---

## 六、归档信息

| 项目 | 内容 |
|---|---|
| 分支 | `archive/F-22-contour-v1` |
| 基于 | `feature/F-22-contour`（已归档，不 push 远端）|
| 核心新文件 | `frontend/src/composables/useContourLayer.ts` |
| 修改文件 | `useMap.ts`、`useGridLayer.ts`、`Legend.vue`、`GridModule.vue`、`utils/grid.ts` |
| 新依赖 | `marchingsquares@1.3.3` |
| 未提交到 dev | 所有代码改动（等值线尚未达到可合并质量）|
| 已 pick 到 dev | 调研文档（`docs/research/`）、BUG 登记（`docs/tasks/bugs/open.md`）|
