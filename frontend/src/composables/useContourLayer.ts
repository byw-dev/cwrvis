import { ref, watch, onUnmounted, toRaw } from 'vue'
import { isoLines } from 'marchingsquares'
import type { Map as MaplibreMap, GeoJSONSource } from 'maplibre-gl'
import { useMap, computeGridScale } from './useMap'
import { useMetaStore } from '@/stores/meta'
import { useVarStore } from '@/stores/var'
import { isKgToMm, currentFrame2D, renderTick } from './useGridLayer'
import { VARS } from '@/config/vars'

export const showContour = ref(false)

const SOURCE_ID = 'contour-source'
const LINE_ID   = 'contour-line'
const LABEL_ID  = 'contour-label'
const N_LINES   = 10

let layersAdded = false

// ── Color generation ──────────────────────────────────────────────────────────

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const f = (n: number) => {
    const k = (n + h * 12) % 12
    return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1))
  }
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)]
}

// Deterministic HSL rainbow: evenly-spaced hues, fixed 50% sat, 80% lightness (pastel)
function generateColors(n: number): string[] {
  return Array.from({ length: n }, (_, i) => {
    const h = i / n  // hue 0–1
    const [r, g, b] = hslToRgb(h, 0.5, 0.80)
    return `rgb(${r},${g},${b})`
  })
}

const COLORS = generateColors(N_LINES)

// ── Smoothing helpers ─────────────────────────────────────────────────────────

function fmtValue(v: number): string {
  return v.toPrecision(4)
}

function interpIdx(arr: number[], frac: number): number {
  const n  = arr.length
  const f  = Math.max(0, Math.min(n - 1, frac))
  const i0 = Math.floor(f), i1 = Math.min(i0 + 1, n - 1)
  return arr[i0] * (1 - (f - i0)) + arr[i1] * (f - i0)
}

// Ramer-Douglas-Peucker
function perpDist(p: number[], a: number[], b: number[]): number {
  const dx = b[0] - a[0], dy = b[1] - a[1]
  if (dx === 0 && dy === 0) return Math.hypot(p[0] - a[0], p[1] - a[1])
  const t = Math.max(0, Math.min(1, ((p[0]-a[0])*dx + (p[1]-a[1])*dy) / (dx*dx + dy*dy)))
  return Math.hypot(p[0] - (a[0]+t*dx), p[1] - (a[1]+t*dy))
}
function rdpRecurse(pts: number[][], s: number, e: number, tol: number, keep: number[]): void {
  let maxD = 0, maxI = 0
  for (let i = s + 1; i < e; i++) {
    const d = perpDist(pts[i], pts[s], pts[e])
    if (d > maxD) { maxD = d; maxI = i }
  }
  if (maxD > tol) { rdpRecurse(pts, s, maxI, tol, keep); keep.push(maxI); rdpRecurse(pts, maxI, e, tol, keep) }
}
function rdp(pts: number[][], tol: number): number[][] {
  if (pts.length <= 2) return pts
  const keep = [0]; rdpRecurse(pts, 0, pts.length - 1, tol, keep); keep.push(pts.length - 1)
  keep.sort((a, b) => a - b); return keep.map(i => pts[i])
}

// Catmull-Rom cubic interpolation（一维，四个控制点 p[0..3]，参数 t∈[0,1]）
function cubicInterp(p: readonly number[], t: number): number {
  const t2 = t * t, t3 = t2 * t
  return (
    p[0] * (-0.5*t3 +      t2 - 0.5*t      ) +
    p[1] * ( 1.5*t3 - 2.5*t2          +  1 ) +
    p[2] * (-1.5*t3 + 2.0*t2 + 0.5*t      ) +
    p[3] * ( 0.5*t3 - 0.5*t2              )
  )
}

// 双三次上采样（C1 连续，消除双线性在格点边界的梯度折角）
function bicubicUpsample(data: number[][], nLat: number, nLon: number, scale: number): number[][] {
  const outNLat = (nLat - 1) * scale + 1
  const outNLon = (nLon - 1) * scale + 1
  const get = (r: number, c: number) =>
    data[Math.max(0, Math.min(r, nLat - 1))][Math.max(0, Math.min(c, nLon - 1))]

  return Array.from({ length: outNLat }, (_, upRow) => {
    const ri = Math.floor(upRow / scale), dr = (upRow / scale) - ri
    return Array.from({ length: outNLon }, (_, upCol) => {
      const ci = Math.floor(upCol / scale), dc = (upCol / scale) - ci
      // 先在 row 方向对 4 列各插值，再在 col 方向插值
      const colVals = ([-1, 0, 1, 2] as const).map(dci =>
        cubicInterp([
          get(ri - 1, ci + dci), get(ri, ci + dci),
          get(ri + 1, ci + dci), get(ri + 2, ci + dci),
        ], dr)
      )
      return cubicInterp(colVals, dc)
    })
  })
}

// Merge adjacent segments sharing an endpoint
function mergeSegments(segs: number[][][]): number[][][] {
  const result: (number[][] | null)[] = segs.map(s => s)
  let changed = true
  while (changed) {
    changed = false
    for (let i = 0; i < result.length; i++) {
      const a = result[i]; if (!a) continue
      for (let j = i + 1; j < result.length; j++) {
        const b = result[j]; if (!b) continue
        const aEnd = a[a.length-1], bStart = b[0], bEnd = b[b.length-1], aStart = a[0]
        if (aEnd[0] === bStart[0] && aEnd[1] === bStart[1]) {
          result[i] = [...a, ...b.slice(1)]; result[j] = null; changed = true; break
        }
        if (bEnd[0] === aStart[0] && bEnd[1] === aStart[1]) {
          result[i] = [...b, ...a.slice(1)]; result[j] = null; changed = true; break
        }
      }
    }
  }
  return result.filter(Boolean) as number[][][]
}

// ── Core computation ──────────────────────────────────────────────────────────

function buildGeoJSON(
  frame2d: (number | null)[][],
  lons: number[],
  lats: number[],
  vmin: number,
  vmax: number,
  dxy: number[][] | null,
  convertToMm: boolean,
): GeoJSON.FeatureCollection | null {
  const nLat = frame2d.length
  const nLon = frame2d[0]?.length ?? 0
  if (!nLat || !nLon || vmin >= vmax) return null

  const step = (vmax - vmin) / (N_LINES + 1)
  const thresholds = Array.from({ length: N_LINES }, (_, i) => vmin + step * (i + 1))
  const sentinel = vmin - step

  // 原始步长（用于边界端点延伸，与 canvas 扩边对齐）
  const lonStep = lons.length > 1 ? lons[1] - lons[0] : 1
  const latStep = lats.length > 1 ? Math.abs(lats[0] - lats[1]) : 1

  // ── 步骤 1：计算有效值（null→sentinel，kg→mm 换算）────────────────────────
  const effectiveData: number[][] = Array.from({ length: nLat }, (_, i) =>
    Array.from({ length: nLon }, (_, j) => {
      const raw = frame2d[i][j]
      if (raw === null) return sentinel
      if (convertToMm && dxy) {
        const d = dxy[i]?.[j]; return (d && d > 0) ? raw / d : sentinel
      }
      return raw
    })
  )

  // ── 步骤 2：双三次上采样（Catmull-Rom，C1 连续，无格点边界折角）──────────────
  // scale 取 canvas 倍率的一半（bicubic 本身导数连续，无需高密度摊平折角）
  const k  = computeGridScale(nLon, nLat)
  const kB = Math.max(8, Math.floor(k / 2))
  const upNLon = (nLon - 1) * kB + 1
  const upNLat = (nLat - 1) * kB + 1

  const upData = bicubicUpsample(effectiveData, nLat, nLon, kB)

  // ── 步骤 3：Marching Squares（在上采样格网上运行）────────────────────────────
  const rawLines = isoLines(upData, thresholds, { noFrame: true, linearRing: false }) as number[][][][]

  // 边界检测器（使用上采样格网坐标，边界点仍在整数位置）
  const EPS = 0.02
  const onL = (c: number) => c <= EPS
  const onR = (c: number) => c >= upNLon - 1 - EPS
  const onT = (r: number) => r <= EPS
  const onB = (r: number) => r >= upNLat - 1 - EPS

  const features: GeoJSON.Feature[] = []

  rawLines.forEach((segsForThreshold, ti) => {
    const color = COLORS[ti % COLORS.length]
    const label = fmtValue(thresholds[ti])
    const merged = mergeSegments(segsForThreshold)

    for (const seg of merged) {
      if (seg.length < 3) continue

      const [c0, r0] = seg[0]
      const [cN, rN] = seg[seg.length - 1]
      const isClosed = Math.abs(c0 - cN) < 0.01 && Math.abs(r0 - rN) < 0.01

      if (!isClosed) {
        const sameBound =
          (onL(c0) && onL(cN)) || (onR(c0) && onR(cN)) ||
          (onT(r0) && onT(rN)) || (onB(r0) && onB(rN))
        if (sameBound) continue
      }

      // RDP 容差按 bicubic 倍率等比放大
      const simplified = rdp(seg, 0.1 * kB)
      if (simplified.length < 2) continue

      // 上采样坐标 → 地理坐标：除以 kB 还原为原始小数格点索引，再插值为经纬度
      const coords = simplified.map(([col, row]) => {
        let lon = interpIdx(lons, col / kB)
        let lat = interpIdx(lats, row / kB)
        // 边界端点延伸半格，对齐 canvas 扩边（与上采样无关，仍用原始步长）
        if (onL(col)) lon -= lonStep / 2
        else if (onR(col)) lon += lonStep / 2
        if (onT(row)) lat += latStep / 2
        else if (onB(row)) lat -= latStep / 2
        return [lon, lat]
      })
      if (coords.length < 2) continue

      features.push({
        type: 'Feature',
        properties: { label, color },
        geometry: { type: 'LineString', coordinates: coords },
      })
    }
  })

  return { type: 'FeatureCollection', features }
}

// ── Composable ────────────────────────────────────────────────────────────────

export function useContourLayer() {
  const { map }   = useMap()
  const metaStore = useMetaStore()
  const varStore  = useVarStore()

  const empty: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }

  function initLayers(m: MaplibreMap) {
    if (layersAdded) { setVisibility(m, showContour.value); return }

    // Clean up stale layers/source from a previous HMR cycle
    try { if (m.getLayer(LABEL_ID)) m.removeLayer(LABEL_ID) } catch {}
    try { if (m.getLayer(LINE_ID))  m.removeLayer(LINE_ID)  } catch {}
    try { if (m.getSource(SOURCE_ID)) m.removeSource(SOURCE_ID) } catch {}

    m.addSource(SOURCE_ID, { type: 'geojson', data: empty })

    // 彩虹等值线：颜色来自 feature 属性
    m.addLayer({
      id: LINE_ID, type: 'line', source: SOURCE_ID,
      paint: {
        'line-color': ['get', 'color'],
        'line-width': 1.4,
      },
      layout: { visibility: 'none' },
    })

    // 标注：同等值线颜色文字 + 宽暗色 halo（模拟深色背景框）
    m.addLayer({
      id: LABEL_ID, type: 'symbol', source: SOURCE_ID,
      layout: {
        'symbol-placement':      'line',
        'symbol-spacing':        280,
        'text-field':            ['get', 'label'],
        'text-size':             11,
        'text-allow-overlap':    false,
        'text-ignore-placement': false,
        'text-rotation-alignment': 'map',
        visibility:              'none',
      },
      paint: {
        'text-color':      ['get', 'color'],  // 与等值线同色
        'text-halo-color': 'rgba(0,0,0,0.92)',
        'text-halo-width': 4,
      },
    })

    layersAdded = true
    if (showContour.value) { setVisibility(m, true); refresh(m) }
  }

  function setVisibility(m: MaplibreMap, on: boolean) {
    if (!layersAdded) return
    const vis = on ? 'visible' : 'none'
    try {
      m.setLayoutProperty(LINE_ID,  'visibility', vis)
      m.setLayoutProperty(LABEL_ID, 'visibility', vis)
    } catch {}
  }

  function refresh(m: MaplibreMap) {
    if (!layersAdded || !showContour.value) return
    const frame2d = currentFrame2D.value
    const grid    = metaStore.grid
    const range   = varStore.renderRange
    if (!frame2d || !grid || !range) return

    const { vmin, vmax } = range
    const varName     = varStore.selVar
    const convertToMm = isKgToMm.value && VARS[varName]?.units === 'kg'
    const dxy         = convertToMm ? toRaw(grid.dxy) : null

    const fc = buildGeoJSON(frame2d, grid.lon, grid.lat, vmin, vmax, dxy, convertToMm)
    if (!fc) return
    ;(m.getSource(SOURCE_ID) as GeoJSONSource).setData(fc)
  }

  function setup() {
    const m = map.value
    if (!m) return
    if (m.isStyleLoaded()) initLayers(m)
    else m.once('load', () => initLayers(m))
  }

  setup()
  watch(() => map.value, (m) => { if (!m) return; if (m.isStyleLoaded()) initLayers(m); else m.once('load', () => initLayers(m)) })
  watch(renderTick,           () => { const m = map.value; if (m) refresh(m) })
  watch(showContour,          (on) => { const m = map.value; if (!m) return; setVisibility(m, on); if (on) refresh(m) })
  watch(isKgToMm,             () => { const m = map.value; if (m) refresh(m) })
  watch(() => varStore.renderRange, () => { const m = map.value; if (m) refresh(m) })

  onUnmounted(() => { const m = map.value; if (m) try { setVisibility(m, false) } catch {} })
}
