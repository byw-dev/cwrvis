import { ref, watch } from 'vue'
import { defineStore } from 'pinia'
import type { BasemapId, ColormapName, AggMode, VarName } from '@/types'

export const FONT_SIZE_OPTIONS = [
  { value: '100%', label: '正常' },
  { value: '125%', label: '大'   },
  { value: '150%', label: '更大' },
] as const

export type FontSizeValue = typeof FONT_SIZE_OPTIONS[number]['value']

// ─── localStorage helpers ─────────────────────────────────────────────────────

const LS_PREFIX = 'cwrvis:'

function readLS<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(LS_PREFIX + key)
    return raw !== null ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function writeLS(key: string, value: unknown): void {
  try {
    localStorage.setItem(LS_PREFIX + key, JSON.stringify(value))
  } catch {
    // localStorage full or unavailable — silently ignore
  }
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useSettingsStore = defineStore('settings', () => {
  const basemap = ref<BasemapId>(
    readLS<BasemapId>('basemap', 'osm')
  )
  const showXizangBoundary = ref<boolean>(
    readLS<boolean>('xizang_boundary', true)
  )
  const scaleMode = ref<'auto' | 'preset'>(
    readLS<'auto' | 'preset'>('scale_mode', 'auto')
  )
  const fontSize = ref<FontSizeValue>(
    readLS<FontSizeValue>('font_size', '100%')
  )
  // Grouped: { CWR: 'turbo', SP: 'viridis', ... }
  const colormaps = ref<Partial<Record<VarName, ColormapName>>>(
    readLS('colormaps', {})
  )
  // Grouped: { monthly: 1, yearly: 2, ... }
  const speeds = ref<Partial<Record<AggMode, number>>>(
    readLS('speeds', {})
  )

  // Auto-persist on change
  watch(basemap,              v => writeLS('basemap',         v))
  watch(showXizangBoundary,  v => writeLS('xizang_boundary', v))
  watch(scaleMode,           v => writeLS('scale_mode',      v))
  watch(fontSize,   v => writeLS('font_size', v))
  watch(colormaps,  v => writeLS('colormaps',  v), { deep: true })
  watch(speeds,     v => writeLS('speeds',     v), { deep: true })

  function getColormap(varName: VarName): ColormapName {
    return colormaps.value[varName] ?? 'turbo'
  }

  function setColormap(varName: VarName, cm: ColormapName): void {
    colormaps.value = { ...colormaps.value, [varName]: cm }
  }

  function getSpeed(mode: AggMode): number {
    return speeds.value[mode] ?? 1
  }

  function setSpeed(mode: AggMode, speed: number): void {
    speeds.value = { ...speeds.value, [mode]: speed }
  }

  function resetAll(): void {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(LS_PREFIX)) localStorage.removeItem(key)
    }
    window.location.reload()
  }

  return {
    basemap,
    showXizangBoundary,
    scaleMode,
    fontSize,
    colormaps,
    speeds,
    getColormap,
    setColormap,
    getSpeed,
    setSpeed,
    resetAll,
  }
})
