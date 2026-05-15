# Bugs — Open

> 格式规范见 `docs/tasks/SCHEMA.md`。

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
