# Feature / Enhancement / Tweak 处理流程

> Agent 收到任何功能性请求时，**必须先分类、后执行**。Bug 走 `BUG-WORKFLOW.md`。

---

## 分类判断

**第一步：排除 Bug**

是否属于"原本正常工作、现在不符合设计"？→ **Bug**，走 `BUG-WORKFLOW.md`，不走本流程。

**第二步：对剩余请求分类**

| 判断标准 | 分类 |
|----------|------|
| 改颜色 / 间距 / 文案 / 图标——无设计决策，改完即验，< 半天 | **Tweak** |
| 改进现有功能的行为或体验——模块架构不变，有明确验收条件 | **Enhancement** |
| 新增此前不存在的功能——可能涉及新组件 / 接口 / 设计文档 | **Feature** |

**Enhancement vs Feature 模糊时**：看架构影响。只改现有模块内部 → Enhancement；需要新组件 / 新路由 / 新后端接口 / 更新设计文档 → Feature。

**执行前必须告知**：Agent 处理任何请求前，须明确说明分类及理由（一句话），用户可纠正后再继续。

---

## Tweak 流程

1. 确认改动的确切范围
2. 直接在 `dev` 实现，单次 commit

```bash
# commit 格式
style(scope): 描述    # 纯视觉调整
chore(scope): 描述    # 配置 / 文案 / 非功能改动
```

---

## Enhancement 流程

1. **问答确认**：改进的具体内容 + 验收条件
2. **任务登记**：
   - 若关联现有任务：在 `active.md` 标注，无需新建条目
   - 若独立改进：在 `phase-N.md` 新增任务条目，写入 `active.md`
3. **建分支**（本地，按需可推远端）：

```bash
git checkout -b enhance/short-name
```

4. **实现**：多次 `wip:` 提交（无格式限制）
5. **用户确认完毕**后：squash → rebase → ff-merge → 删分支

```bash
git reset --soft $(git merge-base HEAD dev)
git commit -m "feat(scope): 描述（改进已有功能）"
git rebase dev
git checkout dev && git merge --ff-only enhance/short-name
git branch -d enhance/short-name
```

6. **更新任务状态**为 DONE

---

## Feature 流程

1. **问答确认**：功能范围、涉及模块、验收条件
2. **设计先行**：若涉及接口或架构变更，先更新 `docs/design/` 相关文档，做一次 docs commit
3. **任务登记**：在 `phase-N.md` 新增带编号的任务条目（`F-XX` / `B-XX` / `S-XX`），写入 `active.md`
4. **建分支**（推送到远端）：

```bash
git checkout -b feature/short-name
git push -u origin feature/short-name   # 可协作、可备份
```

5. **实现**：多次 `wip:` 提交
6. **用户确认完毕**后：squash → rebase → ff-merge → 删分支

```bash
git reset --soft $(git merge-base HEAD dev)
git commit -m "feat(scope): 描述（新增功能）"
git rebase dev
git checkout dev && git merge --ff-only feature/short-name
git branch -d feature/short-name
git push origin --delete feature/short-name   # 清理远端
```

7. **更新任务状态**为 DONE

---

## 汇总

| 类型 | 分支 | 推送远端 | commit 前缀 | 任务登记 |
|------|------|----------|-------------|----------|
| Tweak | ——（直接 dev） | — | `style` / `chore` | 不需要 |
| Enhancement | `enhance/name` | 可选 | `feat` | 视情况 |
| Feature | `feature/name` | ✅ | `feat` | 必须 |
| Bug | `fix/BUG-XX` | ❌ | `fix` | open→close |

---

## 快速参考

```bash
# Tweak：直接提交
git commit -m "style(frontend): 调整图例间距"

# Enhancement
git checkout -b enhance/region-hover-value
# ...wip commits...
git reset --soft $(git merge-base HEAD dev)
git commit -m "feat(frontend): 区域 hover 显示当前帧统计值"
git rebase dev && git checkout dev
git merge --ff-only enhance/region-hover-value
git branch -d enhance/region-hover-value

# Feature
git checkout -b feature/export-png
git push -u origin feature/export-png
# ...wip commits...
git reset --soft $(git merge-base HEAD dev)
git commit -m "feat(frontend): 格点帧导出 PNG"
git rebase dev && git checkout dev
git merge --ff-only feature/export-png
git branch -d feature/export-png
git push origin --delete feature/export-png
```
