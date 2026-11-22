// ─── Variable ────────────────────────────────────────────────────────────────

export type VarName =
  | 'SP' | 'aveMv' | 'aveMh' | 'INv' | 'OTv'
  | 'INh' | 'OTh' | 'MC' | 'GMh' | 'GMv'
  | 'CWR' | 'CEv' | 'PEh' | 'RCv' | 'RCh'

// DEC-018: 全链路迁移前的临时展示层分组 ID
// 迁移完成后（F-32/F-33）改回与数据 key 一致的命名
export type VarGroupId = 'state' | 'advection' | 'conv' | 'total' | 'renew'

export interface VarMeta {
  name: VarName
  // DEC-018 临时字段：UI 展示用新缩写；数据访问仍用 name（旧 key）
  // 全链路迁移完成后删除此字段，直接用 name
  display_name: string
  long_name: string
  units: string
  vmin: number  // natural min for colormap mapping (placeholder, update when data confirmed)
  vmax: number  // natural max for colormap mapping (placeholder, update when data confirmed)
  group: VarGroupId
}

export interface VarGroup {
  id: VarGroupId
  label: string
  vars: VarName[]
}

// ─── Region ──────────────────────────────────────────────────────────────────

// RegionId 在 config/regions.ts 定义（那里是区域集合的唯一真相源）。
// re-export 不产生本地绑定，下面 RegionMeta 要用，所以同时 import。
import type { RegionId } from '@/config/regions'
export type { RegionId }

export type RegionLevel = 'region' | 'province' | 'prefecture'

export interface RegionMeta {
  region_id: RegionId
  name: string
  level: RegionLevel
  // kg→mm 换算除数（m²），由后端 region_areas 表提供。
  // 注意它不一定等于区域面积：area_weighted 方法下统计值是逐格点加权均值，
  // 除数是有效格点面积（详见 scripts/netcdf_to_sqlite.py 模块 docstring）。
  area_m2?: number | null
}

// ─── Aggregation mode & timeline ─────────────────────────────────────────────

export type AggMode =
  | 'monthly'      // 逐月, 312 帧
  | 'yearly'       // 逐年, 26 帧
  | 'avg_yearly'   // 年平均, 1 帧（静态）
  | 'avg_monthly'  // 月平均, 12 帧
  | 'avg_season'   // 季平均, 4 帧

export type Season = 'spring' | 'summer' | 'autumn' | 'winter'

export interface FrameSel {
  year: number    // monthly / yearly / avg_monthly
  month: number   // monthly / avg_monthly (1–12)
  season: Season  // avg_season
}

export interface TimelineItem {
  year?: number
  month?: number
  season?: Season
  label: string
  major: boolean
}

// ─── Basemap ─────────────────────────────────────────────────────────────────

export type BasemapId = 'osm' | 'amap_street' | 'amap_satellite' | 'carto_dark'

export type CoordSys = 'wgs84' | 'gcj02'

export interface BasemapConfig {
  id: BasemapId
  label: string
  tiles: string[]
  attribution: string
  maxZoom: number
  coordSys: CoordSys
}

// ─── Colormap ────────────────────────────────────────────────────────────────

export type ColormapName = 'viridis' | 'turbo' | 'magma' | 'cyan' | 'rdbu'

// ─── Grid metadata (from /grid/meta.json) ────────────────────────────────────

export interface GridMeta {
  grid: {
    lat: number[]
    lon: number[]
    dxy: number[][]  // shape: lat × lon, unit: m²
  }
  timeline: {
    year: number[]
    month: Array<{ year: number; month: number }>
    mean_all: ['mean']
    mean_month: number[]
    mean_season: Season[]
  }
  vars: Record<VarName, { name: VarName; long_name: string; units: string }>
}

// ─── Region stats (from /api/v1/stats) ───────────────────────────────────────
// Wide-schema response: see stores/region.ts for StatsRow / StatsApiData

// ─── Picked point (grid mode) ────────────────────────────────────────────────

export interface PickedPoint {
  lat: number
  lon: number
  value: number | null
}

// ─── Module routing ──────────────────────────────────────────────────────────

export type ModuleId = 'grid' | 'region' | 'export'

export interface ModuleDef {
  id: ModuleId
  label: string
}

export const MODULE_LIST: ModuleDef[] = [
  { id: 'grid',   label: '空间分布' },
  { id: 'region', label: '区域评估' },
  { id: 'export', label: '报告制作' },
]

// ─── API response envelope ───────────────────────────────────────────────────

export interface ApiOk<T> {
  ok: true
  data: T
}

export interface ApiErr {
  ok: false
  error: string
}

export type ApiResult<T> = ApiOk<T> | ApiErr
