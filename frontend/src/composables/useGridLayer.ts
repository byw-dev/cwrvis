import { watch, shallowRef, onUnmounted } from 'vue'
import type { CanvasSource } from 'maplibre-gl'
import { useMap } from './useMap'
import { useTimeStore } from '@/stores/time'
import { useVarStore } from '@/stores/var'
import { useSettingsStore } from '@/stores/settings'
import { VARS } from '@/config/vars'
import { getLut } from '@/utils/colormap'
import { bilinearInterp } from '@/utils/grid'
import type { RenderRequest, RenderResponse } from '@/workers/gridRenderer.worker'
import type { AggMode } from '@/types'

const GRID_BASE = (import.meta.env.VITE_GRID_BASE as string | undefined) ?? '/grid'

// 每次帧渲染完毕（applyBitmap）时递增，供外部 watch 数据就绪
const renderTick = shallowRef(0)

// 模块级懒加载接口，供 HistoryModal 按需获取任意 var+mode 的帧数据
export async function fetchGridFrames(
  varName: string,
  mode: AggMode,
): Promise<(number | null)[][][] | null> {
  const gran = GRAN_PATH[mode]
  const key  = `${varName}_${gran}`
  if (jsonCache.has(key)) return jsonCache.get(key)!
  try {
    const res = await fetch(`${GRID_BASE}/${gran}/${varName}.json`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json() as (number | null)[][][]
    jsonCache.set(key, data)
    return data
  } catch { return null }
}

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

  clear(): void {
    for (const val of this.map.values()) {
      if (val instanceof ImageBitmap) val.close()
    }
    this.map.clear()
  }
}

const imageCache = new LruCache<ImageBitmap>(20)

// ── Composable ────────────────────────────────────────────────────────────────

export function useGridLayer() {
  const { map, gridCanvas } = useMap()
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

    // 若配置的 vmin/vmax 是占位值（量程内无任何数据点），则从帧数据自动计算
    let vmin = meta.vmin
    let vmax = meta.vmax
    const hasDataInRange = frame2d.some(row => row.some(v => v !== null && v > vmin && v < vmax))
    if (!hasDataInRange) {
      let dataMin = Infinity, dataMax = -Infinity
      for (const row of frame2d) {
        for (const v of row) {
          if (v === null) continue
          if (v < dataMin) dataMin = v
          if (v > dataMax) dataMax = v
        }
      }
      if (dataMin <= dataMax) { vmin = dataMin; vmax = dataMax }
    }

    varStore.setRenderRange(vmin, vmax)

    const req: RenderRequest = {
      frame2d,
      lut,
      vmin,
      vmax,
      threshMin: varStore.threshMin ?? vmin,
      threshMax: varStore.threshMax ?? vmax,
      targetW:   600,
      targetH:   400,
      frameKey:  frameKey(varName, mode, idx),
    }
    worker.postMessage(req)
  }

  // 将 ImageBitmap 写入共享 canvas，触发 MapLibre canvas source 单帧更新
  function applyBitmap(bmp: ImageBitmap): void {
    const canvas = gridCanvas.value
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height)

    const m = map.value
    if (!m) return
    const src = m.getSource('grid-overlay') as CanvasSource | undefined
    if (!src) return
    // play() 设置 _playing=true 并调度 repaint，MapLibre 在下一帧正常渲染时
    // 调用 prepare() 上传纹理（此时 style update 已处理，tiles 已就绪）。
    // 2-rAF 后再 pause()，确保至少一帧完整渲染后才停止持续动画。
    src.play()
    requestAnimationFrame(() => requestAnimationFrame(() => src.pause()))
    renderTick.value++
  }

  async function renderCurrent(): Promise<void> {
    const varName = varStore.selVar
    const mode    = timeStore.mode
    const idx     = timeStore.currentIndex
    const key     = frameKey(varName, mode, idx)

    const cached = imageCache.get(key)
    if (cached) { applyBitmap(cached); preload(varName, mode, idx); return }

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

  // 色卡/阈值变更：清缓存后重渲（bitmap 需用新配色重新生成）
  watch(
    [() => settings.colormaps, () => varStore.threshMin, () => varStore.threshMax],
    () => { imageCache.clear(); renderCurrent() },
  )

  // var/时间变更：直接重渲（缓存仍有效）
  watch(
    [() => varStore.selVar, () => timeStore.mode, () => timeStore.currentIndex],
    () => { renderCurrent() },
    { immediate: true },
  )

  // Re-render when map becomes ready (handles race between data fetch and map init)
  watch(
    () => map.value,
    (m) => {
      if (!m) return
      if (m.isStyleLoaded()) {
        renderCurrent()
      } else {
        m.once('load', () => renderCurrent())
      }
    },
  )

  // 获取当前帧在 (lat, lon) 处的插值，供 hover/click 使用
  function getValueAt(lat: number, lon: number): number | null {
    const data = jsonCache.get(cacheKey(varStore.selVar, timeStore.mode))
    const frame = data?.[timeStore.currentIndex]
    return frame ? bilinearInterp(frame, lat, lon) : null
  }

  // 按需加载指定 var + mode 的帧数据，供 HistoryModal 使用
  async function fetchFrames(varName: string, mode: AggMode): Promise<(number | null)[][][] | null> {
    return loadJson(varName, mode)
  }

  onUnmounted(() => { worker.terminate() })

  return { renderCurrent, getValueAt, fetchFrames, renderTick }
}
