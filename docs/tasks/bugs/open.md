# Bugs — Open

> 格式规范见 `docs/tasks/SCHEMA.md`。

---

## BUG-34 · 报告软链接文件可被扫描但无法下载

**发现时间**：2026-06-16
**严重程度**：Minor
**重现步骤**：
1. 将 `static/reports/{region_id}/` 下的 `.docx` 设为指向该目录外部的软链接
2. 重启服务，`/report/meta` 接口正常返回该报告条目（前端可见）
3. 前端点击下载，返回 400/404
**期望行为**：软链接文件可正常下载
**实际行为**：`download_report` 中 `filepath.resolve()` 将软链接展开为真实路径，真实路径不以 `report_root` 开头，被路径前缀断言拦截（`backend/routers/report.py` 第 71 行）
**相关文件**：`backend/routers/report.py`（`download_report` 函数，第 67–72 行）
**修复思路**：路径穿越检查改为在 `resolve()` 之前针对未解析路径执行，`resolve()` 移至检查之后；`region_id` 白名单 + `filename` 确定性拼接已保证无自由字符串注入，安全性不受影响

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
