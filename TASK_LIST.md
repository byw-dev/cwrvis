# TASK_LIST — cwrvis 任务总览

> 本文件是任务系统的入口仪表盘，提供进度全貌和当前聚焦。  
> 完整任务见 [`docs/tasks/phases/phase-1-mvp.md`](docs/tasks/phases/phase-1-mvp.md)；规范与工作流见 [`docs/tasks/SCHEMA.md`](docs/tasks/SCHEMA.md)。

---

## 当前阶段：Phase 1 MVP

**目标**：完成可演示、满足甲方验收的最小可用版本。

### 进度快照

| 模块 | 总计 | ✅ DONE | 🔄 IN_PROGRESS | 📋 TODO | 🚫 BLOCKED |
|------|:----:|:-------:|:--------------:|:-------:|:----------:|
| S 数据脚本 | 4 | 1 | 0 | 2 | 1 |
| B 后端 API | 4 | 0 | 0 | 4 | 0 |
| F 前端 | 19 | 5 | 0 | 14 | 0 |
| D 部署 | 3 | 0 | 0 | 3 | 0 |
| **合计** | **30** | **6** | **0** | **23** | **1** |

→ 完整任务清单：[`docs/tasks/phases/phase-1-mvp.md`](docs/tasks/phases/phase-1-mvp.md)

---

## 当前聚焦

→ [`docs/tasks/active.md`](docs/tasks/active.md)

---

## 关键阻塞

| ID | 阻塞原因 | 等待方 |
|----|---------|--------|
| S-02 | 区域统计 SQLite 生成，需要 netcdf 原始数据 | 甲方提供数据 |

---

## 待确认事项（影响开发）

| # | 事项 | 影响任务 | 状态 |
|---|------|---------|------|
| 1 | 高德地图 API Key | F-08（切换高德底图时需要） | ⏳ 待申请 |
| 2 | 具体 data_var 色卡参数（量程、控制点） | F-03 `config/vars.ts` | ⏳ 待数据同事提供 |
| 3 | 报告文件命名规则与甲方最终确认 | B-03、F-17 | ⏳ 待确认 |
| 4 | 服务器 IP / 域名 / HTTPS 证书 | D-01、D-03 | ⏳ 待运维 |

---

## 验收标准（Phase 1）

> 来源：`CLAUDE.md` → "第一阶段验收标准"，此处同步以便对照任务。

- [ ] 地图正常加载底图（默认 OSM，可切换高德街道/卫星）— **F-08、F-18**
- [ ] ≥3 个 data_var 的格点数据可正确渲染（颜色、双线性插值、透明度）— **F-09、F-10、F-11**
- [ ] 时间轴可播放，帧切换流畅无明显卡顿 — **F-07、F-10**
- [ ] 色卡阈值过滤可用（图例上设置 min/max 隐藏超出范围的格点）— **F-12**
- [ ] ≥2 个预设区域可点击，显示区域统计图表 — **F-14、F-15、F-16**
- [ ] 报告下载链接可正常触发文件下载 — **B-03、F-17**
- [ ] 系统在公网服务器上稳定运行，响应时间合理 — **D-01、D-02**

> ⚠️ 注意：`CLAUDE.md` 原文写"高德底图"，已按 DEC-004 决策更新为"默认 OSM、可切换高德"。
> 若甲方验收要求强制使用高德，需申请 API Key 并将 `settings.basemap` 默认值改为 `'amap_street'`。

---

## 关联文档

| 文档 | 说明 |
|------|------|
| [`CLAUDE.md`](CLAUDE.md) | 项目主指南（技术栈、约定、验收标准） |
| [`DECISIONS.md`](DECISIONS.md) | 技术决策记录（DEC-001 ~ DEC-012） |
| [`docs/design/frontend.md`](docs/design/frontend.md) | 前端架构与 UI 设计规范 |
| [`docs/design/backend.md`](docs/design/backend.md) | 后端 API 设计 |
| [`docs/design/overview.md`](docs/design/overview.md) | 系统总体设计 |
