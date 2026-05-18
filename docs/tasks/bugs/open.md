# Bugs — Open

> 格式规范见 `docs/tasks/SCHEMA.md`。

---

## BUG-21 · 格点季平均（mean_season）对 kg 变量计算逻辑错误，结果偏低约 3 倍

**发现时间**：2026-05-18
**严重程度**：Major
**重现步骤**：在"空间分布"模块切换至"季平均"聚合模式，查看任意 kg 单位变量（如 SP 地面降水、CWR 云水资源量等），与区域评估模块的季平均数值对比
**期望行为**：格点季平均 = 先对每年季节内 3 个月求和，再对多年取平均（与后端 `/stats` 接口 mean_season 两步聚合逻辑一致）
**实际行为**：格点季平均 = 直接对所有年所有同季月份取 `np.nanmean`，等价于月均值，对 kg 变量偏低约 3 倍
**受影响变量**：所有 kg 单位变量（11 个）：SP、CWR、GMv、GMh、aveMv、aveMh、INv、OTv、INh、OTh、MC；`%`/`day`/`hour` 单位变量（4 个）不受影响
**相关文件**：`scripts/netcdf_to_json.py`（`_compute_means` 函数，`mean_season` 分支）；修复后需重新运行 `make data-grid` 重生成 `static/grid/mean_season/` 下 11 个文件

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
