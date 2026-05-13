import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { RegionId, RegionMeta, VarName, StatRow, RegionStatsCache, ApiResult, StatsResponse } from '@/types'
import { YEAR_MIN, YEAR_MAX } from '@/config/constants'

export const useRegionStore = defineStore('region', () => {
  const selRegionId = ref<RegionId>('xizang')
  const regions     = ref<RegionMeta[]>([])
  // key: `${regionId}__${varName}`
  const statsCache  = ref(new Map<string, RegionStatsCache>())

  const selRegion = computed(() =>
    regions.value.find(r => r.region_id === selRegionId.value) ?? null
  )

  // ── Region list ────────────────────────────────────────────────────────────

  async function loadRegions(): Promise<void> {
    if (regions.value.length > 0) return
    try {
      const base = import.meta.env.VITE_API_BASE ?? '/api/v1'
      const res  = await fetch(`${base}/meta/regions`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = (await res.json()) as ApiResult<RegionMeta[]>
      if (json.ok) regions.value = json.data
    } catch {
      // Fallback: hardcoded list so the UI works without a backend
      regions.value = FALLBACK_REGIONS
    }
  }

  // ── Stats data ─────────────────────────────────────────────────────────────

  function cacheKey(regionId: RegionId, varName: VarName): string {
    return `${regionId}__${varName}`
  }

  function getCached(regionId: RegionId, varName: VarName): RegionStatsCache | undefined {
    return statsCache.value.get(cacheKey(regionId, varName))
  }

  async function loadStats(regionId: RegionId, varName: VarName): Promise<RegionStatsCache | null> {
    const key = cacheKey(regionId, varName)
    const hit = statsCache.value.get(key)
    if (hit) return hit

    try {
      const base = import.meta.env.VITE_API_BASE ?? '/api/v1'
      const params = (gran: string) =>
        new URLSearchParams({
          region_id:   regionId,
          granularity: gran,
          year_start:  String(YEAR_MIN),
          year_end:    String(YEAR_MAX),
          var:         varName,
        })

      const [resYear, resMonth] = await Promise.all([
        fetch(`${base}/stats?${params('year')}`),
        fetch(`${base}/stats?${params('month')}`),
      ])

      if (!resYear.ok || !resMonth.ok) return null

      const [jsonYear, jsonMonth] = await Promise.all([
        resYear.json()  as Promise<ApiResult<StatsResponse>>,
        resMonth.json() as Promise<ApiResult<StatsResponse>>,
      ])

      if (!jsonYear.ok || !jsonMonth.ok) return null

      const cache: RegionStatsCache = {
        year:  (jsonYear.data.vars[varName]  as StatRow[] | undefined) ?? [],
        month: (jsonMonth.data.vars[varName] as StatRow[] | undefined) ?? [],
      }
      statsCache.value.set(key, cache)
      return cache
    } catch {
      return null
    }
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
    selectRegion,
  }
})

// ─── Fallback region list (no backend needed for UI dev) ─────────────────────

const FALLBACK_REGIONS: RegionMeta[] = [
  { region_id: 'xizang',  name: '西藏自治区', level: 'province'    },
  { region_id: 'lasa',    name: '拉萨市',     level: 'prefecture'  },
  { region_id: 'rikaze',  name: '日喀则市',   level: 'prefecture'  },
  { region_id: 'shannan', name: '山南市',     level: 'prefecture'  },
  { region_id: 'linzhi',  name: '林芝市',     level: 'prefecture'  },
  { region_id: 'changdu', name: '昌都市',     level: 'prefecture'  },
  { region_id: 'naqu',    name: '那曲市',     level: 'prefecture'  },
  { region_id: 'ali',     name: '阿里地区',   level: 'prefecture'  },
]
