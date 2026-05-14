// ─── Variable ────────────────────────────────────────────────────────────────

export type VarName =
  | 'SP' | 'aveMv' | 'aveMh' | 'INv' | 'OTv'
  | 'INh' | 'OTh' | 'MC' | 'GMh' | 'GMv'
  | 'CWR' | 'CEv' | 'PEh' | 'RCv' | 'RCh'

export type VarGroupId = 'cwr' | 'state' | 'flux' | 'conv' | 'renew'

export interface VarMeta {
  name: VarName
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

export type RegionId =
  | 'xizang' | 'lasa' | 'rikaze' | 'shannan'
  | 'linzhi' | 'changdu' | 'naqu' | 'ali'

export type RegionLevel = 'province' | 'prefecture'

export interface RegionMeta {
  region_id: RegionId
  name: string
  level: RegionLevel
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
  { id: 'grid',   label: '格点数据' },
  { id: 'region', label: '区域统计' },
  { id: 'export', label: '数据导出' },
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
