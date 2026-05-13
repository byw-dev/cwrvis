# 任务管理规范 — cwrvis

## 目录结构

```
docs/tasks/
├── SCHEMA.md              本文件：规范、状态定义、工作流说明
├── active.md              当前进行中的任务（≤5 项，随时保持最新）
├── backlog.md             未规划到任何阶段的需求/想法
├── phases/
│   └── phase-1-mvp.md    第一阶段完整任务清单（含状态跟踪）
├── bugs/
│   ├── open.md            未解决的 Bug
│   └── closed.md          已解决的 Bug
└── archive/               已完成阶段归档（完成时将 phases/*.md 移入）
```

**说明**：
- Changelog 由 git log 承担，不在此维护
- `active.md` 是"当前聚焦"（≤5 项），`phases/*.md` 是"完整任务池"，二者互补不重复
- 任务完成后在 phase 文件中更新状态；`active.md` 只保留仍在进行的项

---

## 状态标签

| 标签 | 含义 |
|------|------|
| `TODO` | 待开始，已在计划内 |
| `IN_PROGRESS` | 正在进行 |
| `DONE` | 已完成 |
| `BLOCKED` | 被阻塞（需在任务行注明原因） |
| `CANCELLED` | 取消，不再做（注明原因） |

Markdown 写法：

```markdown
- [ ] `TODO` 任务标题
- [ ] `IN_PROGRESS` 任务标题
- [x] `DONE` 任务标题
- [ ] `BLOCKED` 任务标题 ← 阻塞原因：等待 XXX
- [ ] `CANCELLED` 任务标题 ← 原因：需求变更
```

---

## 任务 ID 规范

格式：`{前缀}-{两位数字}`

| 前缀 | 模块 |
|------|------|
| `S` | Scripts / 数据预生成脚本 |
| `B` | Backend / 后端 API |
| `F` | Frontend / 前端 |
| `D` | Deploy / 部署与运维 |
| `BUG` | Bug（在 bugs/ 中使用） |

示例：`F-01`、`B-03`、`BUG-07`

---

## 任务条目格式

最小格式（简单任务）：

```markdown
- [ ] `TODO` **F-01** 项目初始化
```

含详情格式（复杂任务）：

```markdown
- [ ] `TODO` **F-10** useGridLayer composable
  - fetch + 帧缓存（LRU 20 帧）
  - Web Worker 调用与 ImageSource 更新
  - 预加载 ±2 帧
```

含阻塞信息：

```markdown
- [ ] `BLOCKED` **S-02** netcdf_to_sqlite.py ← 等待甲方提供 netcdf 原始数据
```

---

## Bug 条目格式（`bugs/open.md` 和 `bugs/closed.md`）

```markdown
## BUG-01 · 标题简述

**发现时间**：YYYY-MM-DD
**发现者**：（可选）
**严重程度**：Critical / Major / Minor
**重现步骤**：
1. ...
2. ...
**期望行为**：
**实际行为**：
**相关文件**：`path/to/file.ts:line`
**修复记录**（closed 时填写）：commit hash / 描述
```

---

## 工作流

```
新任务出现
    │
    ├─ 属于当前阶段 → 加入 phases/phase-N.md，标记 TODO
    └─ 属于未来/待定 → 加入 backlog.md
    
开始一项任务
    │
    ├─ 在 phases/*.md 中改状态为 IN_PROGRESS
    └─ 加入 active.md（复制标题行）

完成
    │
    ├─ 在 phases/*.md 中改状态为 DONE，打勾
    └─ 从 active.md 中删除

阶段完成
    │
    ├─ phases/phase-N.md 移入 archive/
    ├─ 创建 phases/phase-(N+1).md
    └─ 更新 active.md
```
