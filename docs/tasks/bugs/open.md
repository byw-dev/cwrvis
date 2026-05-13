# Bugs — Open

> 格式规范见 `docs/tasks/SCHEMA.md`。

## BUG-01 · `/api/v1/report/download` 路径穿越风险

**发现时间**：2026-05-13
**发现者**：Copilot PR Review
**严重程度**：Critical
**重现步骤**：
1. 请求 `/api/v1/report/download` 并在 `region_id`/`start`/`end` 中构造 `../` 等路径片段
2. 服务端按字符串拼接文件路径并直接访问
3. 当目标路径存在且可匹配后缀时，可能读取 `REPORT_DIR` 外文件
**期望行为**：仅允许访问 `REPORT_DIR` 目录内、符合命名规则的报告文件
**实际行为**：存在目录穿越窗口，输入参数未经白名单校验且未进行目录约束校验
**相关文件**：`backend/routers/report.py:12`
