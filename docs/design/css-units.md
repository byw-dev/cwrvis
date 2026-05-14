# CSS 单位规范 — cwrvis 前端

> 决策版本：v1.0
> 适用范围：`frontend/src/` 所有样式（`.vue` scoped、全局 CSS）

---

## 决策摘要

**全站以 `rem` 为主要字号和布局尺寸单位，以 `em` 为组件内间距单位，仅在物理像素语义明确时使用 `px`。**

---

## 背景与动机

现代显示设备的物理像素密度（DPI）差异极大——从普通 1× 屏到 macOS Retina 的 2×、Windows 高 DPI 的 1.25–1.5×，再到 4K/5K 外接屏。浏览器通过设备像素比（`devicePixelRatio`）将 CSS 像素映射到物理像素，因此 CSS 层的 `px` 本质上是"逻辑像素"，并非物理像素。

然而，传统 `px` 的核心缺陷在于：

1. **不响应用户字号偏好**：浏览器的"最小字体大小"和用户在系统/浏览器设置的"基础字号"只对 `em`/`rem` 生效，`px` 绕过这层语义。
2. **不随浏览器缩放等比调整**：用 `px` 写死的布局在高 DPI + 非标系统缩放下容易出现文字溢出容器、间距比例失调等问题。
3. **组件间尺寸耦合**：间距和字号写死为绝对值，调整一处需要全局搜索替换。

---

## 单位选择规则

| 使用场景 | 推荐单位 | 说明 |
|----------|----------|------|
| 全局字号（body、html） | `px`（仅此处） | `html { font-size: 16px }` 设定 rem 基准；`body { font-size: 1rem }` 继承 |
| 组件字号 | `rem` | 相对于根字号，全局统一缩放 |
| 组件内 padding / margin | `em` | 相对于当前元素字号，字号放大时间距自动等比缩放 |
| 布局尺寸（nav 高、rail 宽等） | `rem` | 通过 CSS 变量集中管理（`--h-nav: 2.75rem`） |
| 容器宽度（流式布局） | `%` / `vw` | 避免固定像素宽度 |
| 细线 / 边框 | `1px` | 物理像素语义，不应缩放 |
| ECharts JS 配置中的 fontSize | `px`（保留） | ECharts 不读 CSS rem；使用等效 px 值，后续单独评估 |
| 媒体查询断点 | `rem` | 与根字号联动，避免断点在缩放时失效 |
| `box-shadow` blur/spread | `px` | 视觉效果类，不需要跟随字号缩放 |
| `border-radius` | `px` 或 `em` 均可 | 本项目 UI 规范为"无圆角"，通常为 0 |

---

## 容器高度原则

**严禁在包含文本的容器上使用固定 `height`。** 理由：字号放大后文字高度增加，固定高度会导致内容溢出或被截断。

```css
/* ✗ 错误 */
.nav-item { height: 44px; }

/* ✓ 正确：用 padding 撑开，加 min-height 兜底 */
.nav-item {
  padding: 0.75em 1.25em;
  min-height: 2.75rem;
  display: flex;
  align-items: center;
}
```

例外：纯图标按钮（无文字，尺寸固定）、Canvas 画布（ECharts 必须有明确宽高）可使用固定值。

---

## 实现约定

### 根字号

```css
/* global.css */
html { font-size: 16px; }        /* rem 基准：1rem = 16px */
body { font-size: 1rem; line-height: 1.5; }
```

### 布局 CSS 变量（variables.css）

```css
:root {
  --h-nav:    2.75rem;   /* 44px / 16 */
  --h-sub:    2.75rem;   /* 44px / 16 */
  --h-bottom: 5.375rem;  /* 86px / 16 */
  --w-rail:   3.5rem;    /* 56px / 16 */
}
```

### 等宽字体栈

```css
:root {
  --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
               "Cascadia Code", "Source Code Pro",
               "PingFang SC", "Microsoft YaHei", monospace;
}
```

`ui-monospace` 优先使用系统等宽字体（macOS: SF Mono，Windows 11: Cascadia Code，Linux: 发行版配置），兼顾中文回退，无需加载 Web Font。

### ECharts 图表容器

```css
.chart-area {
  width: 100%;      /* 自适应父容器 */
  height: 460px;    /* ECharts 需要物理高度，保留 px */
}
```

宽度变化时须调用 `chart.resize()`（通过 `nextTick` 触发），以同步 ECharts 内部尺寸。

### 豁免项

以下元素**豁免**上述规范，保持绝对定位和 px：

- 地图叠加层（Inspector、Legend、HoverTooltip）：通过 `position: fixed` 叠加在 MapLibre 画布上，坐标由 JS 计算，不适合 Flexbox 流式布局。
- MapLibre GL 容器本身：由地图库内部管理。

---

## 迁移策略

### 优先级排序

1. **全局基础**（`variables.css`、`global.css`）— 改动最小，影响面最广，最先改
2. **布局层**（ProductNav、BottomBar、SubToolbar、LeftRail）— 修复基础改动引入的容器溢出
3. **内容组件**（模态框、面板、tooltip）— 逐文件改，互相独立，按需推进

### 换算参考

| 常用旧值 | rem 等价 | em 等价（父 = 1rem） |
|----------|----------|----------------------|
| `9px`    | `0.5625rem` | `0.5625em` |
| `10px`   | `0.625rem`  | `0.625em`  |
| `11px`   | `0.6875rem` | `0.6875em` |
| `12px`   | `0.75rem`   | `0.75em`   |
| `13px`   | `0.8125rem` | `0.8125em` |
| `14px`   | `0.875rem`  | `0.875em`  |
| `16px`   | `1rem`      | `1em`      |
| `20px`   | `1.25rem`   | `1.25em`   |
| `24px`   | `1.5rem`    | `1.5em`    |
| `32px`   | `2rem`      | `2em`      |
| `44px`   | `2.75rem`   | —          |
| `56px`   | `3.5rem`    | —          |
| `86px`   | `5.375rem`  | —          |
