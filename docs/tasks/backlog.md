# Backlog — 待规划需求

> 记录未分配到任何阶段的想法、优化项、后续功能。  
> 条目成熟后移入对应 phase 文件，加上任务 ID 和状态。

---

## 挂起任务（技术攻坚中止）

以下任务在 Phase 1 期间启动但因技术难度超预期而暂停，代码归档于 `archive/F-22-contour-v1`，
详细过程和遗留难点见 `docs/research/contour-exploration-log.md`。

- **F-22** 格点图层等值线叠加
  - **挂起原因**：等值线平滑性依赖双三次上采样，与图层 canvas 双线性插值存在系统性映射偏差（BUG-18）；数值标注需要 deck.gl TextLayer 才能实现参考站的胶囊背景样式，引入 deck.gl 会带来架构变更，应与 F-23 一起决策
  - **继续建议**：先修复 BUG-14~18，再与 F-23 捆绑引入 deck.gl

- **F-23** 格点图层高低点标注
  - **挂起原因**：调研已完成（见 `contour-research.md`），但渲染方案（deck.gl TextLayer + CollisionFilterExtension）与 F-22 标注方案耦合，应一并决策后再实现

- **F-24** 格点图层数值标注
  - **挂起原因**：依赖 F-22 的叠加层基础设施，随 F-22/F-23 一并推迟

---

## 第二阶段候选

- 地图上点击导出当前帧为 PNG（含图例、时间戳水印）
- 格点数据剖面工具：沿用户划线提取时序
- 多变量并排对比视图（双联地图）
- 动画导出为 GIF / MP4
- 站点观测模块（Tab 04）实现
- 时序分析模块（Tab 03）实现
- 移动端适配

## 变量名称全链路迁移（DEC-018 全链路规划，待数据同步后执行）

> 当前已通过临时方案（F-31，`display_name` 字段）解决前端展示层。以下为完整迁移所需的后续任务，条件是甲方提供按新命名生成的源数据。

- **S-09** `[M]` 更新 `netcdf_to_json.py`：新变量 key → 旧 key 映射，重新生成 `static/grid/` 全量 JSON
- **S-10** `[M]` 更新 `netcdf_to_sqlite.py` / `csv_to_sqlite.py`：列名对齐新命名，重建 `db/stats.db`
- **B-09** `[S]` 更新 `backend/config.py`（KG_VARS）、`routers/stats.py` 列名引用
- **F-32** `[S]` 更新 `frontend/src/types/index.ts`：`VarName` 类型改为新缩写联合类型
- **F-33** `[S]` 删除 `VarMeta.display_name` 临时字段，所有 `display_name` 引用回退为直接用 `name`
- 触发条件：甲方交付按新命名的 NC/CSV 文件，且 S-09/S-10 验收通过后，按 S→B→F 顺序依次执行

---

## 技术债 / 优化

- **区域层级关系通用化**（见 DEC-017）：当前区域 ID、父子关系全部硬编码，扩展到多省/多层级时需系统性重构前后端
- Web Worker 改为 SharedArrayBuffer + 零拷贝传输（需 COOP/COEP header）
- 格点 JSON 改为 MessagePack 二进制格式（减小体积约 30%）
- 区域统计数据考虑一次性全量加载（当前是按 region + var 懒加载）
- ECharts 实例复用（当前每次打开 Modal 通过 v-if 重建，可改为 v-show + resize）
- CSS rem/em 迁移：CategoryFlyout.vue 等第三波未覆盖的组件仍有 px 值，可后续补全（优先级低，不影响功能）
- 格点图层"跨帧可比较"模式：当前为逐帧自动量程，若需要观察绝对值变化趋势，可增加"全序列统一量程"选项
- 区域历史弹窗 Y 轴最多支持 3 根右轴（% / day / hour），超出时共用最右侧轴；若未来新增量纲需重新评估
- HistoryModal（格点）目前不支持多 var 对比，仅展示单点时序；可考虑参照 RegionHistoryModal 支持多 var

## 待外部确认

以下事项依赖甲方或运维提供，不属于开发任务，但会阻塞对应功能的最终交付：

| # | 问题 | 状态 | 阻塞功能 |
|---|------|------|----------|
| P-1 | 区域边界 GeoJSON — 甲方最终 shape 文件若另行提供，需确认坐标系；若为 WGS-84 须转换为 GCJ-02 | ✅ 初始文件已入库（来自高德，GCJ-02） | 区域统计 |
| P-2 | 高德地图 API Key 申请与配额确认 | ⏳ 待申请 | 高德底图 |
| P-3 | 报告文件命名规则与甲方最终确认 | ⏳ 待确认 | 报告下载 |
| P-4 | 服务器 IP / 域名 / HTTPS 证书 | ⏳ 待运维提供 | 生产部署 |
| P-5 | 具体 data_var 列表与色卡参数（当前使用占位配置） | ⏳ 待数据同事提供 | 色卡精度 |
