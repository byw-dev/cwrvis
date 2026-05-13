import { watch, onUnmounted } from 'vue'
import type { ImageSource } from 'maplibre-gl'
import { useMap } from './useMap'
import { useTimeStore } from '@/stores/time'
import { useVarStore } from '@/stores/var'
import { useSettingsStore } from '@/stores/settings'
import { VARS } from '@/config/vars'
import { getLut } from '@/utils/colormap'
import type { RenderRequest, RenderResponse } from '@/workers/gridRenderer.worker'
import type { AggMode } from '@/types'

const GRID_BASE = (import.meta.env.VITE_GRID_BASE as string | undefined) ?? '/grid'

const GRAN_PATH: Record<AggMode, string> = {
  monthly:     'month',
  yearly:      'year',
  avg_yearly:  'mean_all',
  avg_monthly: 'mean_month',
  avg_season:  'mean_season',
}

// JSON cache: `{var}_{gran}` → all frames data
const jsonCache = new Map<string, (number | null)[][][]>()

// ── LRU ImageBitmap cache ─────────────────────────────────────────────────────

class LruCache<V> {
  private map = new Map<string, V>()
  constructor(private max: number) {}

  get(key: string): V | undefined { return this.map.get(key) }

  set(key: string, val: V): void {
    if (this.map.has(key)) this.map.delete(key)
    this.map.set(key, val)
    if (this.map.size > this.max) {
      const oldest = this.map.keys().next().value
      const evicted = this.map.get(oldest)
      this.map.delete(oldest)
      if (evicted instanceof ImageBitmap) evicted.close()
    }
  }

  has(key: string): boolean { return this.map.has(key) }
}

const imageCache = new LruCache<ImageBitmap>(20)

// ── Composable ────────────────────────────────────────────────────────────────

export function useGridLayer() {
  const { map }     = useMap()
  const timeStore   = useTimeStore()
  const varStore    = useVarStore()
  const settings    = useSettingsStore()

  const worker = new Worker(
    new URL('../workers/gridRenderer.worker.ts', import.meta.url),
    { type: 'module' },
  )

  // Receive rendered ImageBitmap from Worker
  worker.onmessage = (e: MessageEvent<RenderResponse>) => {
    const { imageBitmap, frameKey } = e.data
    imageCache.set(frameKey, imageBitmap)
    // If this is still the frame we need, push to map
    if (frameKey === currentFrameKey()) {
      applyBitmap(imageBitmap)
    }
  }

  function cacheKey(varName: string, mode: AggMode): string {
    return `${varName}_${GRAN_PATH[mode]}`
  }

  function frameKey(varName: string, mode: AggMode, idx: number): string {
    return `${varName}_${GRAN_PATH[mode]}_${idx}`
  }

  function currentFrameKey(): string {
    return frameKey(varStore.selVar, timeStore.mode, timeStore.currentIndex)
  }

  async function loadJson(varName: string, mode: AggMode): Promise<(number | null)[][][] | null> {
    const key = cacheKey(varName, mode)
    if (jsonCache.has(key)) return jsonCache.get(key)!

    try {
      const url = `${GRID_BASE}/${GRAN_PATH[mode]}/${varName}.json`
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json() as (number | null)[][][]
      jsonCache.set(key, data)
      return data
    } catch (err) {
      console.warn('[useGridLayer] fetch failed:', err)
      return null
    }
  }

  function sendToWorker(
    frame2d: (number | null)[][],
    varName: string,
    mode: AggMode,
    idx: number,
  ): void {
    const meta   = VARS[varName as keyof typeof VARS]!
    const cmName = settings.getColormap(varName as any)
    const lut    = getLut(cmName)

    const req: RenderRequest = {
      frame2d,
      lut,
      vmin:      meta.vmin,
      vmax:      meta.vmax,
      threshMin: varStore.threshMin ?? meta.vmin,
      threshMax: varStore.threshMax ?? meta.vmax,
      targetW:   600,
      targetH:   400,
      frameKey:  frameKey(varName, mode, idx),
    }
    worker.postMessage(req)
  }

  function applyBitmap(bmp: ImageBitmap): void {
    const m = map.value
    if (!m?.isStyleLoaded()) return
    try {
      const src = m.getSource('grid-overlay') as ImageSource | undefined
      if (!src) return
      const url = bitmapToObjectUrl(bmp)
      src.updateImage({ url })
    } catch { /* map not ready */ }
  }

  // ImageBitmap → object URL for MapLibre updateImage
  function bitmapToObjectUrl(bmp: ImageBitmap): string {
    const canvas = document.createElement('canvas')
    canvas.width  = bmp.width
    canvas.height = bmp.height
    canvas.getContext('2d')!.drawImage(bmp, 0, 0)
    return canvas.toDataURL()  // synchronous for small bitmaps
  }

  async function renderCurrent(): Promise<void> {
    const varName = varStore.selVar
    const mode    = timeStore.mode
    const idx     = timeStore.currentIndex
    const key     = frameKey(varName, mode, idx)

    // Cache hit
    const cached = imageCache.get(key)
    if (cached) { applyBitmap(cached); preload(varName, mode, idx); return }

    // Fetch JSON then render
    const data = await loadJson(varName, mode)
    if (!data) return
    const frame = data[idx]
    if (!frame) return

    sendToWorker(frame, varName, mode, idx)
    preload(varName, mode, idx)
  }

  async function preload(varName: string, mode: AggMode, centerIdx: number): Promise<void> {
    const data = jsonCache.get(cacheKey(varName, mode))
    if (!data) return
    const total = data.length
    for (const offset of [-2, -1, 1, 2]) {
      const idx = centerIdx + offset
      if (idx < 0 || idx >= total) continue
      const key = frameKey(varName, mode, idx)
      if (imageCache.has(key)) continue
      sendToWorker(data[idx]!, varName, mode, idx)
    }
  }

  // Watch for state changes that require re-render
  watch(
    [
      () => varStore.selVar,
      () => timeStore.mode,
      () => timeStore.currentIndex,
      () => settings.colormaps,
      () => varStore.threshMin,
      () => varStore.threshMax,
    ],
    () => { renderCurrent() },
    { immediate: true },
  )

  onUnmounted(() => { worker.terminate() })

  return { renderCurrent }
}
