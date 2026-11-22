// 区域集合的唯一真相源（master：西藏）。
//
// 须与 backend/config.py 的 REGION_MAP、scripts/netcdf_to_sqlite.py 的 REGION_MAP
// 以及 static/shapes/{region_id}.geojson 保持一致。
//
// 本文件刻意不 import '@/types'：RegionId 在这里定义，由 types/index.ts 反向
// re-export，避免循环依赖。
//
// 地图中心/缩放不在此配置 —— 初始视野由 nc 格点范围推导（见 composables/useMap.ts）。

/** 全区（省/地区级），地图上不可点选，作为「清除选择」的归位目标 */
export const OVERALL_REGION_ID = 'xizang'

/** 全区下属的可点选区域 */
export const SUB_REGION_IDS = [
  'lasa',
  'rikaze',
  'shannan',
  'linzhi',
  'changdu',
  'naqu',
  'ali',
] as const

export const ALL_REGION_IDS = [OVERALL_REGION_ID, ...SUB_REGION_IDS] as const

export type RegionId = typeof ALL_REGION_IDS[number]

/** 全区在下拉框/悬浮提示中的显示名 */
export const OVERALL_LABEL = '西藏自治区（全区）'

/** 设置面板中行政边界开关的说明文案 */
export const BOUNDARY_HINT = '西藏全区外轮廓 + 7 个地市分界线'
