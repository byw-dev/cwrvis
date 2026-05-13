import type { VarMeta, VarName, VarGroup, VarGroupId } from '@/types'

// ⚠️  vmin/vmax 为占位值，待数据同事确认后更新（见 backlog.md）
export const VARS: Record<VarName, VarMeta> = {
  SP:    { name: 'SP',    long_name: '地面降水',       units: 'kg', vmin: 0,   vmax: 500,  group: 'cwr'   },
  CWR:   { name: 'CWR',   long_name: '云水资源量',     units: 'kg', vmin: 0,   vmax: 600,  group: 'cwr'   },
  aveMv: { name: 'aveMv', long_name: '水汽平均状态量', units: 'kg', vmin: 0,   vmax: 1000, group: 'state' },
  aveMh: { name: 'aveMh', long_name: '水凝物平均状态量', units: 'kg', vmin: 0, vmax: 100,  group: 'state' },
  GMv:   { name: 'GMv',   long_name: '水汽总量',       units: 'kg', vmin: 0,   vmax: 2000, group: 'state' },
  GMh:   { name: 'GMh',   long_name: '水凝物总量',     units: 'kg', vmin: 0,   vmax: 200,  group: 'state' },
  INv:   { name: 'INv',   long_name: '水汽输入值',     units: 'kg', vmin: 0,   vmax: 5000, group: 'flux'  },
  OTv:   { name: 'OTv',   long_name: '水汽输出值',     units: 'kg', vmin: 0,   vmax: 5000, group: 'flux'  },
  INh:   { name: 'INh',   long_name: '水凝物输入值',   units: 'kg', vmin: 0,   vmax: 500,  group: 'flux'  },
  OTh:   { name: 'OTh',   long_name: '水凝物输出值',   units: 'kg', vmin: 0,   vmax: 500,  group: 'flux'  },
  MC:    { name: 'MC',    long_name: '云凝结',         units: 'kg', vmin: 0,   vmax: 500,  group: 'conv'  },
  CEv:   { name: 'CEv',   long_name: '水汽凝结效率',   units: '%',  vmin: 0,   vmax: 100,  group: 'conv'  },
  PEh:   { name: 'PEh',   long_name: '水凝物降水效率', units: '%',  vmin: 0,   vmax: 100,  group: 'conv'  },
  RCv:   { name: 'RCv',   long_name: '水汽更新期',     units: 'day', vmin: 0,  vmax: 30,   group: 'renew' },
  RCh:   { name: 'RCh',   long_name: '水凝物更新期',   units: 'hour', vmin: 0, vmax: 200,  group: 'renew' },
}

export const VAR_GROUPS: VarGroup[] = [
  { id: 'cwr',   label: '资源量', vars: ['SP', 'CWR'] },
  { id: 'state', label: '状态量', vars: ['aveMv', 'aveMh', 'GMv', 'GMh'] },
  { id: 'flux',  label: '通量',   vars: ['INv', 'OTv', 'INh', 'OTh'] },
  { id: 'conv',  label: '转化',   vars: ['MC', 'CEv', 'PEh'] },
  { id: 'renew', label: '更新期', vars: ['RCv', 'RCh'] },
]

export const VAR_GROUP_BY_ID = Object.fromEntries(
  VAR_GROUPS.map(g => [g.id, g])
) as Record<VarGroupId, VarGroup>

// Which group a given var belongs to
export const VAR_TO_GROUP = Object.fromEntries(
  VAR_GROUPS.flatMap(g => g.vars.map(v => [v, g.id]))
) as Record<VarName, VarGroupId>

export const VAR_LIST = Object.values(VARS)

export const DEFAULT_VAR: VarName = 'CWR'
