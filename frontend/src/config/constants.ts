import type { Season } from '@/types'

export const YEAR_MIN = 2000
export const YEAR_MAX = 2025

export interface SeasonDef {
  id: Season
  label: string
  months: number[]
}

export const SEASONS: SeasonDef[] = [
  { id: 'spring', label: '春',  months: [3, 4, 5] },
  { id: 'summer', label: '夏',  months: [6, 7, 8] },
  { id: 'autumn', label: '秋',  months: [9, 10, 11] },
  { id: 'winter', label: '冬',  months: [12, 1, 2] },
]

export const SEASON_BY_ID = Object.fromEntries(
  SEASONS.map(s => [s.id, s])
) as Record<Season, SeasonDef>

// Month label for display
export function fmtMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`
}
