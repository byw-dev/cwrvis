# Backlog — 待规划需求

> 记录未分配到任何阶段的想法、优化项、后续功能。  
> 条目成熟后移入对应 phase 文件，加上任务 ID 和状态。

---

## 第二阶段候选

- 地图上点击导出当前帧为 PNG（含图例、时间戳水印）
- 格点数据剖面工具：沿用户划线提取时序
- 多变量并排对比视图（双联地图）
- 动画导出为 GIF / MP4
- 站点观测模块（Tab 04）实现
- 时序分析模块（Tab 03）实现
- 移动端适配

## 技术债 / 优化

- Web Worker 改为 SharedArrayBuffer + 零拷贝传输（需 COOP/COEP header）
- 格点 JSON 改为 MessagePack 二进制格式（减小体积约 30%）
- 区域统计数据考虑一次性全量加载（当前是按 region + var 懒加载）
- ECharts 实例复用（当前每次打开 Modal 通过 v-if 重建，可改为 v-show + resize）
- CSS rem/em 迁移：CategoryFlyout.vue 等第三波未覆盖的组件仍有 px 值，可后续补全（优先级低，不影响功能）
- 格点图层"跨帧可比较"模式：当前为逐帧自动量程，若需要观察绝对值变化趋势，可增加"全序列统一量程"选项
- 区域历史弹窗 Y 轴最多支持 3 根右轴（% / day / hour），超出时共用最右侧轴；若未来新增量纲需重新评估
- HistoryModal（格点）目前不支持多 var 对比，仅展示单点时序；可考虑参照 RegionHistoryModal 支持多 var

## 待确认

- 甲方最终确认 data_var 列表与色卡参数（当前使用占位配置）
- 报告文件命名规则（与甲方最终确认后固化，见 CLAUDE.md Pending #3）
- 服务器域名 / HTTPS 证书（见 CLAUDE.md Pending #4）
- 高德地图 API Key（若需切换高德底图，见 CLAUDE.md Pending #2）
