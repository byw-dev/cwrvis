import { ref, watch, shallowRef, onUnmounted, toRaw } from 'vue'
import { useMap, computeGridScale } from './useMap'
import { useTimeStore } from '@/stores/time'
import { useVarStore } from '@/stores/var'
import { useSettingsStore } from '@/stores/settings'
import { useMetaStore } from '@/stores/meta'
import { VARS } from '@/config/vars'
import { getLut } from '@/utils/colormap'
import { bilinearInterp } from '@/utils/grid'
import type { RenderRequest, RenderResponse } from '@/workers/gridRenderer.worker'
import type { AggMode } from '@/types'

// kg→mm 换算状态：模块级，Legend 与 HistoryModal 共享
export const isKgToMm = ref(false)

type FrameData = { imageData: ImageData; vmin: number; vmax: number }

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

// ── LRU frame cache ───────────────────────────────────────────────────────────

class LruCache<V> {
  private map = new Map<string, V>()
  constructor(private max: number) {}

  get(key: string): V | undefined { return this.map.get(key) }

  set(key: string, val: V): void {
    if (this.map.has(key)) this.map.delete(key)
    this.map.set(key, val)
    if (this.map.size > this.max) {
      const oldest = this.map.keys().next().value!
      this.map.delete(oldest)
    }
  }

  has(key: string): boolean { return this.map.has(key) }

  clear(): void {
    this.map.clear()
  }
}

const imageCache    = new LruCache<FrameData>(20)
// sendToWorker 与 worker.onmessage 之间传递量程，避免异步丢失
const pendingRanges = new Map<string, { vmin: number; vmax: number }>()
// 正在 Worker 中渲染的帧 key 集合；防止 renderCurrent + preload 对同一帧重复投递
// 导致第二次 onmessage 找不到 pendingRanges 条目而回退到 {0,1}（BUG-20）
const pendingKeys   = new Set<string>()

// ── Composable ────────────────────────────────────────────────────────────────

export function useGridLayer() {
  const { map, gridCanvas } = useMap()
  const timeStore   = useTimeStore()
  const varStore    = useVarStore()
  const settings    = useSettingsStore()
  const metaStore   = useMetaStore()

  const worker = new Worker(
    new URL('../workers/gridRenderer.worker.ts', import.meta.url),
    { type: 'module' },
  )

  // Receive rendered pixels from Worker
  worker.onmessage = (e: MessageEvent<RenderResponse>) => {
    const { pixels, width, height, frameKey } = e.data
    pendingKeys.delete(frameKey)
    const range = pendingRanges.get(frameKey) ?? { vmin: 0, vmax: 1 }
    pendingRanges.delete(frameKey)
    const frameData: FrameData = {
      imageData: new ImageData(new Uint8ClampedArray(pixels), width, height),
      vmin: range.vmin,
      vmax: range.vmax,
    }
    imageCache.set(frameKey, frameData)
    if (frameKey === currentFrameKey()) {
      applyBitmap(frameData)
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
    const cmName = settings.getColormap(varName as any)
    const lut    = getLut(cmName)

    const needConvert = isKgToMm.value && VARS[varName]?.units === 'kg'
    // metaStore.grid.dxy 是 Vue reactive Proxy，postMessage structuredClone 无法序列化；
    // toRaw 取出底层原始数组再传给 Worker
    const dxy = needConvert ? (metaStore.grid?.dxy ? toRaw(metaStore.grid.dxy) : null) : null

    // 逐帧从数据自动计算量程（mm 模式下用换算后的值推算）
    let dataMin = Infinity, dataMax = -Infinity
    for (let i = 0; i < frame2d.length; i++) {
      for (let j = 0; j < (frame2d[i]?.length ?? 0); j++) {
        const v = frame2d[i][j]
        if (v === null) continue
        const d = dxy?.[i]?.[j]
        const eff = (needConvert && d && d > 0) ? v / d : v
        if (eff < dataMin) dataMin = eff
        if (eff > dataMax) dataMax = eff
      }
    }
    if (!isFinite(dataMin)) { dataMin = 0; dataMax = 1 }  // 全缺测兜底

    // 用户手动输入的一侧优先，另一侧用帧数据自动值
    const vmin = varStore.threshMin ?? dataMin
    const vmax = varStore.threshMax ?? dataMax

    varStore.setRenderRange(vmin, vmax)

    const fk = frameKey(varName, mode, idx)
    if (pendingKeys.has(fk)) return  // 已在渲染中，跳过重复投递（BUG-20 修复）
    pendingKeys.add(fk)
    pendingRanges.set(fk, { vmin, vmax })

    const nLon = metaStore.grid?.lon.length ?? 25
    const nLat = metaStore.grid?.lat.length ?? 15
    const k    = computeGridScale(nLon, nLat)

    const req: RenderRequest = {
      frame2d,
      lut,
      vmin,
      vmax,
      targetW:  nLon * k,
      targetH:  nLat * k,
      frameKey: fk,
      ...(needConvert && dxy ? { dxy, convertToMm: true } : {}),
    }
    worker.postMessage(req)
  }

  function applyBitmap(frame: FrameData): void {
    const canvas = gridCanvas.value
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.putImageData(frame.imageData, 0, 0)
    varStore.setRenderRange(frame.vmin, frame.vmax)
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

  // 色卡/阈值/单位变更：清 bitmap 缓存后重渲
  watch(
    [() => settings.colormaps, () => varStore.threshMin, () => varStore.threshMax, isKgToMm],
    () => { imageCache.clear(); pendingKeys.clear(); pendingRanges.clear(); renderCurrent() },
  )

  // var/聚合模式变更：重置单位换算状态
  watch([() => varStore.selVar, () => timeStore.mode], () => {
    isKgToMm.value = false
  })

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
    const grid = metaStore.grid
    if (!grid) return null
    const data = jsonCache.get(cacheKey(varStore.selVar, timeStore.mode))
    const frame = data?.[timeStore.currentIndex]
    if (!frame) return null
    const val = bilinearInterp(frame, lat, lon, grid.lat, grid.lon)
    if (val === null) return null
    if (isKgToMm.value && VARS[varStore.selVar]?.units === 'kg') {
      const dxy = grid.dxy
      if (dxy) {
        const dxyVal = bilinearInterp(dxy as (number | null)[][], lat, lon, grid.lat, grid.lon)
        return dxyVal && dxyVal > 0 ? val / dxyVal : null
      }
    }
    return val
  }

  // 按需加载指定 var + mode 的帧数据，供 HistoryModal 使用
  async function fetchFrames(varName: string, mode: AggMode): Promise<(number | null)[][][] | null> {
    return loadJson(varName, mode)
  }

  onUnmounted(() => { worker.terminate() })

  return { renderCurrent, getValueAt, fetchFrames, renderTick }
}
