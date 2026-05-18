# BUG 处理流程 — cwrvis

> 本文档规定 AI Agent 在本项目中处理 BUG 的完整流程。  
> **每次遇到 BUG 报告时，Agent 必须主动遵循此流程，不得跳过任何阶段。**

---

## 总览

```
用户报告 BUG
     │
     ▼
[阶段 1] 报告：记录到 open.md → commit A（dev 分支）
     │
     ▼
[阶段 2] 修复：新建 fix/ 分支 → 多次调试提交 → 用户确认 → squash → rebase → ff-merge 回 dev
     │
     ▼
[阶段 3] 关闭：移入 closed.md（含根因/方案/决策）→ commit C（dev 分支）
```

---

## 阶段 1 — 报告 BUG

### 流程

1. **问答确认**：与用户确认重现步骤、期望行为与实际行为；初步判断涉及的模块、相关文件、修复方向。
2. **写入 `docs/tasks/bugs/open.md`**：按 `SCHEMA.md` 中的 Bug 条目格式填写（不含"修复记录"字段）。
3. **提交**（在 `dev` 分支）：

```bash
git add docs/tasks/bugs/open.md
git commit -m "docs(bugs): 报告 BUG-XX [/ BUG-YY]"
```

### 规则

- BUG 编号续接 `closed.md` 中已有的最高编号（`BUG-11` 之后为 `BUG-12`）。
- 多个相关 BUG（同次报告、同一根因域）可在同一 commit 中一并写入 `open.md`。
- 无关 BUG 必须分批次独立记录。

---

## 阶段 2 — 修复 BUG

### 分支约定

- 从当前 `dev` 位置新建本地分支，**永远不推送到远端**：

  ```bash
  git checkout -b fix/BUG-12          # 单个 BUG
  git checkout -b fix/BUG-12-13       # 多个相关 BUG（命名含所有编号）
  ```

- **相关 BUG**（可合并修复、共享根因或彼此依赖）：同一分支，最终合并为**同一个** fix commit。
- **无关 BUG**：必须分别建立独立分支，独立修复，独立合并，不得混入同一 commit。

### 调试期间的提交

分支上的中间提交没有格式限制，可使用 `wip:` 前缀：

```bash
git commit -m "wip: 尝试方案 A"
git commit -m "wip: 修正边界条件"
```

### 用户确认修复完毕后：squash + rebase + merge

```bash
# 1. 将分支上所有提交 squash 为一个干净的 fix commit
git reset --soft $(git merge-base HEAD dev)
git commit -m "fix(scope): BUG-12 BUG-13 修复描述"
#   scope = 受影响的模块，如 frontend / backend / scripts
#   修复描述简明扼要，不超过一行

# 2. 若 dev 在分支期间有新提交，先 rebase
git rebase dev

# 3. 快进合并回 dev，保持线性历史
git checkout dev
git merge --ff-only fix/BUG-12-13

# 4. 删除本地修复分支
git branch -d fix/BUG-12-13
```

> **关键约束**：修复分支从不推送远端，因此无需 force push，不影响协作。历史重写只发生在本地临时分支上。

---

## 阶段 3 — 关闭 BUG

### 流程

1. **从 `open.md` 移除**对应条目。
2. **追加到 `closed.md`**：在原有条目字段基础上，**必须补充**以下三项：

   | 字段 | 要求 |
   |------|------|
   | **出现原因** | 根因分析，技术上为何会发生 |
   | **修复方案** | 做了什么改动，逻辑上如何解决 |
   | **技术决策**（如有） | 修复过程中做出的设计选择及理由 |
   | **修复记录** | `{fix_commit_hash} — 一句话描述` |

3. **提交**（在 `dev` 分支）：

```bash
git add docs/tasks/bugs/open.md docs/tasks/bugs/closed.md
git commit -m "docs(bugs): 关闭 BUG-XX [/ BUG-YY]"
```

---

## commit 格式总结

| 阶段 | 格式 | 示例 |
|------|------|------|
| 报告 | `docs(bugs): 报告 BUG-XX [/ BUG-YY]` | `docs(bugs): 报告 BUG-12 / BUG-13` |
| 修复 | `fix(scope): BUG-XX [BUG-YY] 描述` | `fix(frontend): BUG-12 BUG-13 修复 kg→mm 图层冻结与坐标精度` |
| 关闭 | `docs(bugs): 关闭 BUG-XX [/ BUG-YY]` | `docs(bugs): 关闭 BUG-12 / BUG-13` |

---

## 完整示例（git log 视角）

```
dc9b39c docs(bugs): 关闭 BUG-12 / BUG-13          ← 阶段 3（dev）
5e1746c fix(frontend): BUG-12 BUG-13 修复 ...      ← 阶段 2 squash（dev，来自 fix/BUG-12-13）
5868149 docs(bugs): 报告 BUG-12 / BUG-13           ← 阶段 1（dev）
ed82437 chore(tasks): B-06 标记为 DONE             ← 其他工作
```

---

## 快速参考

```bash
# ── 阶段 1：报告 ──────────────────────────────────────────────
# 编辑 docs/tasks/bugs/open.md（续接最高 BUG 编号）
git add docs/tasks/bugs/open.md
git commit -m "docs(bugs): 报告 BUG-XX"

# ── 阶段 2：修复 ──────────────────────────────────────────────
git checkout -b fix/BUG-XX             # 从 dev 当前位置新建
# ...多次 wip 提交...
# 用户确认后：
git reset --soft $(git merge-base HEAD dev)
git commit -m "fix(scope): BUG-XX 描述"
git rebase dev                         # 若 dev 有新提交
git checkout dev
git merge --ff-only fix/BUG-XX
git branch -d fix/BUG-XX

# ── 阶段 3：关闭 ──────────────────────────────────────────────
# 编辑 open.md（删除）+ closed.md（追加，含根因/方案/决策）
git add docs/tasks/bugs/
git commit -m "docs(bugs): 关闭 BUG-XX"
```
