import { watch, onUnmounted } from 'vue'
import type { Map as MaplibreMap } from 'maplibre-gl'
import { useMap } from './useMap'
import { useSettingsStore } from '@/stores/settings'
import { BASEMAPS } from '@/config/basemaps'

const SHAPES_BASE = (import.meta.env.VITE_SHAPES_BASE as string | undefined) ?? '/shapes'
const DISTRICT_IDS = ['lasa', 'rikaze', 'shannan', 'linzhi', 'changdu', 'naqu', 'ali'] as const

function shiftCoords(geojson: GeoJSON.FeatureCollection, dx: number, dy: number): GeoJSON.FeatureCollection {
  function shiftRing(ring: number[][]): number[][] {
    return ring.map(([lon, lat]) => [lon + dx, lat + dy])
  }
  function shiftGeom(g: GeoJSON.Geometry): GeoJSON.Geometry {
    if (g.type === 'Polygon')      return { ...g, coordinates: g.coordinates.map(shiftRing) }
    if (g.type === 'MultiPolygon') return { ...g, coordinates: g.coordinates.map(p => p.map(shiftRing)) }
    return g
  }
  return {
    ...geojson,
    features: geojson.features.map(f => ({ ...f, geometry: shiftGeom(f.geometry as GeoJSON.Geometry) })),
  }
}

// ── Module-level singletons ────────────────────────────────────────────────────

const geoCache = new Map<string, GeoJSON.FeatureCollection>()
let layersAdded = false

// ── Composable ─────────────────────────────────────────────────────────────────

export function useXizangBoundary() {
  const { map }   = useMap()
  const settings  = useSettingsStore()

  async function loadGeo(id: string): Promise<GeoJSON.FeatureCollection | null> {
    if (geoCache.has(id)) return geoCache.get(id)!
    try {
      const res = await fetch(`${SHAPES_BASE}/${id}.geojson`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      let gj: GeoJSON.FeatureCollection = await res.json()
      if (BASEMAPS[settings.basemap].coordSys === 'wgs84') gj = shiftCoords(gj, -0.01, 0.005)
      geoCache.set(id, gj)
      return gj
    } catch { return null }
  }

  function showLayers(m: MaplibreMap) {
    if (!layersAdded) return
    try {
      m.setLayoutProperty('xizang-prefecture-halo', 'visibility', 'visible')
      m.setLayoutProperty('xizang-prefecture-line', 'visibility', 'visible')
      m.setLayoutProperty('xizang-outer-halo',      'visibility', 'visible')
      m.setLayoutProperty('xizang-outer-line',      'visibility', 'visible')
    } catch {}
  }

  function hideLayers(m: MaplibreMap) {
    if (!layersAdded) return
    try {
      m.setLayoutProperty('xizang-prefecture-halo', 'visibility', 'none')
      m.setLayoutProperty('xizang-prefecture-line', 'visibility', 'none')
      m.setLayoutProperty('xizang-outer-halo',      'visibility', 'none')
      m.setLayoutProperty('xizang-outer-line',      'visibility', 'none')
    } catch {}
  }

  async function initLayers(m: MaplibreMap): Promise<void> {
    if (layersAdded) {
      if (settings.showXizangBoundary) showLayers(m)
      return
    }

    const [xizangGeo, ...prefGeos] = await Promise.all([
      loadGeo('xizang'),
      ...DISTRICT_IDS.map(id => loadGeo(id)),
    ])

    if (!xizangGeo) return

    const prefFeatures: GeoJSON.Feature[] = []
    prefGeos.forEach(gj => { if (gj) prefFeatures.push(...gj.features) })

    m.addSource('xizang-boundary-outer', {
      type: 'geojson',
      data: xizangGeo,
    })
    m.addSource('xizang-boundary-prefectures', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: prefFeatures },
    })

    // 地市分界（视觉权重低，先加层在下方）
    m.addLayer({
      id: 'xizang-prefecture-halo', type: 'line', source: 'xizang-boundary-prefectures',
      paint: { 'line-color': 'rgba(0,0,0,0.4)', 'line-width': 1.5 },
    })
    m.addLayer({
      id: 'xizang-prefecture-line', type: 'line', source: 'xizang-boundary-prefectures',
      paint: { 'line-color': 'rgba(255,255,255,0.5)', 'line-width': 0.75 },
    })

    // 全区外轮廓（视觉权重高，后加层在上方）
    m.addLayer({
      id: 'xizang-outer-halo', type: 'line', source: 'xizang-boundary-outer',
      paint: { 'line-color': 'rgba(0,0,0,0.5)', 'line-width': 2.5 },
    })
    m.addLayer({
      id: 'xizang-outer-line', type: 'line', source: 'xizang-boundary-outer',
      paint: { 'line-color': 'rgba(255,255,255,0.85)', 'line-width': 1.5 },
    })

    layersAdded = true
    if (!settings.showXizangBoundary) hideLayers(m)
  }

  // map 就绪时初始化（处理初次渲染竞态）
  watch(
    () => map.value,
    (m) => {
      if (!m) return
      if (m.isStyleLoaded()) initLayers(m)
      else m.once('load', () => initLayers(m))
    },
    { immediate: true },
  )

  // 设置开关实时响应
  watch(
    () => settings.showXizangBoundary,
    (show) => {
      const m = map.value
      if (!m) return
      if (show) showLayers(m)
      else hideLayers(m)
    },
  )

  onUnmounted(() => { const m = map.value; if (m) hideLayers(m) })
}
