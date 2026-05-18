import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { AggMode, FrameSel, Season, TimelineItem } from '@/types'
import { YEAR_MIN, YEAR_MAX, SEASONS } from '@/config/constants'

export const useTimeStore = defineStore('time', () => {
  const mode    = ref<AggMode>('monthly')
  const sel     = ref<FrameSel>({ year: 2010, month: 1, season: 'summer' })
  const playing = ref(false)

  // ── Timeline item builders ─────────────────────────────────────────────────

  const items = computed<TimelineItem[]>(() => buildItems(mode.value))

  const currentIndex = computed(() => {
    const list = items.value
    switch (mode.value) {
      case 'monthly':
        return list.findIndex(
          it => it.year === sel.value.year && it.month === sel.value.month
        )
      case 'yearly':
        return list.findIndex(it => it.year === sel.value.year)
      case 'avg_monthly':
        return list.findIndex(it => it.month === sel.value.month)
      case 'avg_season':
        return list.findIndex(it => it.season === sel.value.season)
      default:
        return 0
    }
  })

  // ── Navigation ─────────────────────────────────────────────────────────────

  function goToIndex(index: number): void {
    const list = items.value
    const clamped = Math.max(0, Math.min(list.length - 1, index))
    const it = list[clamped]
    if (!it) return
    applyItem(it)
  }

  function stepBack(): void  { goToIndex(currentIndex.value - 1) }
  function stepForward(): void { goToIndex(currentIndex.value + 1) }

  function stepForwardWrapping(): void {
    const next = (currentIndex.value + 1) % items.value.length
    goToIndex(next)
  }

  function applyItem(it: TimelineItem): void {
    sel.value = {
      year:   it.year   ?? sel.value.year,
      month:  it.month  ?? sel.value.month,
      season: it.season ?? sel.value.season,
    }
  }

  function setMode(m: AggMode): void {
    mode.value = m
    playing.value = false
  }

  return {
    mode,
    sel,
    playing,
    items,
    currentIndex,
    setMode,
    goToIndex,
    stepBack,
    stepForward,
    stepForwardWrapping,
  }
})

// ─── Pure helpers (also exported for BottomBar) ───────────────────────────────

export function buildItems(mode: AggMode): TimelineItem[] {
  switch (mode) {
    case 'monthly': {
      const out: TimelineItem[] = []
      for (let y = YEAR_MIN; y <= YEAR_MAX; y++) {
        for (let m = 1; m <= 12; m++) {
          out.push({
            year: y, month: m,
            major: m === 1 && y % 5 === 0,
            label: m === 1 ? String(y) : '',
          })
        }
      }
      return out
    }
    case 'yearly': {
      const out: TimelineItem[] = []
      for (let y = YEAR_MIN; y <= YEAR_MAX; y++) {
        out.push({ year: y, major: y % 5 === 0, label: String(y) })
      }
      return out
    }
    case 'avg_yearly':
      return [{ label: `${YEAR_MIN}–${YEAR_MAX}`, major: true }]
    case 'avg_monthly':
      return Array.from({ length: 12 }, (_, i) => i + 1).map(m => ({
        month: m,
        major: true,
        label: `${String(m).padStart(2, '0')}月`,
      }))
    case 'avg_season':
      return SEASONS.map(s => ({
        season: s.id as Season,
        major: true,
        label: s.label,
      }))
  }
}

export const MODE_LABELS: Record<AggMode, string> = {
  monthly:     '原始 · 逐月',
  yearly:      '原始 · 逐年',
  avg_yearly:  '统计 · 年平均',
  avg_monthly: '统计 · 月平均',
  avg_season:  '统计 · 季平均',
}

export const AGG_MODES_RAW:  AggMode[] = ['monthly', 'yearly']
export const AGG_MODES_STAT: AggMode[] = ['avg_yearly', 'avg_monthly', 'avg_season']

export const AGG_MODE_LABELS: Record<AggMode, string> = {
  monthly:     '逐月',
  yearly:      '逐年',
  avg_yearly:  '年平均',
  avg_monthly: '月平均',
  avg_season:  '季平均',
}
