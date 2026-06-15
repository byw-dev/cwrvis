import type { VarMeta, VarName, VarGroup, VarGroupId } from '@/types'

// ⚠️  vmin/vmax 为占位值，待数据同事确认后更新（见 backlog.md）
// DEC-018：display_name 为临时展示层字段，全链路迁移后（F-32/F-33）删除
export const VARS: Record<VarName, VarMeta> = {
  SP:    { name: 'SP',    display_name: 'Ps',  long_name: '地面降水量',       units: 'kg',   vmin: 0,   vmax: 500,  group: 'conv'      },
  CWR:   { name: 'CWR',  display_name: 'CWR', long_name: '云水资源量',       units: 'kg',   vmin: 0,   vmax: 600,  group: 'total'     },
  aveMv: { name: 'aveMv',display_name: 'MMv', long_name: '水汽平均状态量',   units: 'kg',   vmin: 0,   vmax: 1000, group: 'state'     },
  aveMh: { name: 'aveMh',display_name: 'MMh', long_name: '水凝物平均状态量', units: 'kg',   vmin: 0,   vmax: 100,  group: 'state'     },
  GMv:   { name: 'GMv',  display_name: 'GMv', long_name: '水汽总量',         units: 'kg',   vmin: 0,   vmax: 2000, group: 'total'     },
  GMh:   { name: 'GMh',  display_name: 'GMh', long_name: '大气水凝物总量',   units: 'kg',   vmin: 0,   vmax: 200,  group: 'total'     },
  INv:   { name: 'INv',  display_name: 'Qvi', long_name: '水汽输入量',       units: 'kg',   vmin: 0,   vmax: 5000, group: 'advection' },
  OTv:   { name: 'OTv',  display_name: 'Qvo', long_name: '水汽输出量',       units: 'kg',   vmin: 0,   vmax: 5000, group: 'advection' },
  INh:   { name: 'INh',  display_name: 'Qhi', long_name: '水凝物输入量',     units: 'kg',   vmin: 0,   vmax: 500,  group: 'advection' },
  OTh:   { name: 'OTh',  display_name: 'Qho', long_name: '水凝物输出量',     units: 'kg',   vmin: 0,   vmax: 500,  group: 'advection' },
  MC:    { name: 'MC',   display_name: 'Cvh', long_name: '云凝结量',         units: 'kg',   vmin: 0,   vmax: 500,  group: 'conv'      },
  CEv:   { name: 'CEv',  display_name: 'CEv', long_name: '水汽凝结效率',     units: '%',    vmin: 0,   vmax: 100,  group: 'conv'      },
  PEh:   { name: 'PEh',  display_name: 'PEh', long_name: '水凝物降水效率',   units: '%',    vmin: 0,   vmax: 100,  group: 'conv'      },
  RCv:   { name: 'RCv',  display_name: 'RTv', long_name: '水汽更新期',       units: 'day',  vmin: 0,   vmax: 30,   group: 'renew'     },
  RCh:   { name: 'RCh',  display_name: 'RTh', long_name: '水凝物更新期',     units: 'hour', vmin: 0,   vmax: 200,  group: 'renew'     },
}

// DEC-018：分组顺序已更新，原"资源量"/"通量"分组废止
export const VAR_GROUPS: VarGroup[] = [
  { id: 'state',     label: '状态量', vars: ['aveMv', 'aveMh'] },
  { id: 'advection', label: '平流量', vars: ['INv', 'OTv', 'INh', 'OTh'] },
  { id: 'conv',      label: '转化',   vars: ['MC', 'SP', 'CEv', 'PEh'] },
  { id: 'total',     label: '总量',   vars: ['GMv', 'GMh', 'CWR'] },
  { id: 'renew',     label: '更新期', vars: ['RCv', 'RCh'] },
]

export const VAR_GROUP_BY_ID = Object.fromEntries(
  VAR_GROUPS.map(g => [g.id, g])
) as Record<VarGroupId, VarGroup>

export const VAR_TO_GROUP = Object.fromEntries(
  VAR_GROUPS.flatMap(g => g.vars.map(v => [v, g.id]))
) as Record<VarName, VarGroupId>

export const VAR_LIST = Object.values(VARS)

export const DEFAULT_VAR: VarName = 'CWR'
