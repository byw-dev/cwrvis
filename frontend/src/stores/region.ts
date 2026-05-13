import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { RegionId, RegionMeta, VarName, AggMode, ApiResult } from '@/types'
import { YEAR_MIN, YEAR_MAX } from '@/config/constants'

// ── New wide-schema API response types ────────────────────────────────────────

export interface StatsRow {
  year?:   number
  month?:  number
  season?: string
  [varName: string]: number | null | undefined
}

export interface StatsApiData {
  region_id:   RegionId
  granularity: string
  rows:        StatsRow[]
}

// Map from AggMode to the granularity string sent to the API
const MODE_TO_GRAN: Record<AggMode, string> = {
  monthly:     'month',
  yearly:      'year',
  avg_yearly:  'mean_all',
  avg_monthly: 'mean_month',
  avg_season:  'mean_season',
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useRegionStore = defineStore('region', () => {
  const selRegionId = ref<RegionId>('xizang')
  const regions     = ref<RegionMeta[]>([])
  // key: `${regionId}_${granularity}` e.g. 'xizang_year'
  const statsCache  = ref(new Map<string, StatsRow[]>())

  const selRegion = computed(() =>
    regions.value.find(r => r.region_id === selRegionId.value) ?? null
  )

  // ── Region list ─────────────────────────────────────────────────────────────

  async function loadRegions(): Promise<void> {
    if (regions.value.length > 0) return
    try {
      const base = import.meta.env.VITE_API_BASE ?? '/api/v1'
      const res  = await fetch(`${base}/meta/regions`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = (await res.json()) as ApiResult<RegionMeta[]>
      if (json.ok) regions.value = json.data
    } catch {
      regions.value = FALLBACK_REGIONS
    }
  }

  // ── Stats ───────────────────────────────────────────────────────────────────

  function cacheKey(regionId: RegionId, mode: AggMode): string {
    return `${regionId}_${MODE_TO_GRAN[mode]}`
  }

  function getCached(regionId: RegionId, mode: AggMode): StatsRow[] | undefined {
    return statsCache.value.get(cacheKey(regionId, mode))
  }

  async function loadStats(regionId: RegionId, mode: AggMode): Promise<StatsRow[] | null> {
    const key = cacheKey(regionId, mode)
    const hit = statsCache.value.get(key)
    if (hit) return hit

    try {
      const base = import.meta.env.VITE_API_BASE ?? '/api/v1'
      const params = new URLSearchParams({
        region_id:   regionId,
        granularity: MODE_TO_GRAN[mode],
        year_start:  String(YEAR_MIN),
        year_end:    String(YEAR_MAX),
      })
      const res  = await fetch(`${base}/stats?${params}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = (await res.json()) as ApiResult<StatsApiData>
      if (!json.ok) return null
      const rows = json.data.rows
      statsCache.value.set(key, rows)
      return rows
    } catch {
      return null
    }
  }

  /** Get the value of a specific var for the current frame index. */
  function getValueAtIndex(regionId: RegionId, mode: AggMode, idx: number, varName: VarName): number | null {
    const rows = getCached(regionId, mode)
    if (!rows) return null
    const row = rows[idx]
    if (!row) return null
    const v = row[varName as string]
    return typeof v === 'number' ? v : null
  }

  function selectRegion(id: RegionId): void {
    selRegionId.value = id
  }

  return {
    selRegionId,
    regions,
    statsCache,
    selRegion,
    loadRegions,
    loadStats,
    getCached,
    getValueAtIndex,
    selectRegion,
  }
})

// ─── Fallback ────────────────────────────────────────────────────────────────

const FALLBACK_REGIONS: RegionMeta[] = [
  { region_id: 'xizang',  name: '西藏自治区', level: 'province'   },
  { region_id: 'lasa',    name: '拉萨市',     level: 'prefecture' },
  { region_id: 'rikaze',  name: '日喀则市',   level: 'prefecture' },
  { region_id: 'shannan', name: '山南市',     level: 'prefecture' },
  { region_id: 'linzhi',  name: '林芝市',     level: 'prefecture' },
  { region_id: 'changdu', name: '昌都市',     level: 'prefecture' },
  { region_id: 'naqu',    name: '那曲市',     level: 'prefecture' },
  { region_id: 'ali',     name: '阿里地区',   level: 'prefecture' },
]
