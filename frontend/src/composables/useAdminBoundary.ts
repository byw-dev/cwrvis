import { watch, onUnmounted } from 'vue'
import type { Map as MaplibreMap, GeoJSONSource } from 'maplibre-gl'
import { useMap } from './useMap'
import { useSettingsStore } from '@/stores/settings'
import { BASEMAPS } from '@/config/basemaps'
import { OVERALL_REGION_ID, SUB_REGION_IDS } from '@/config/regions'

const SHAPES_BASE = (import.meta.env.VITE_SHAPES_BASE as string | undefined) ?? '/shapes'

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

export function useAdminBoundary() {
  const { map }   = useMap()
  const settings  = useSettingsStore()

  let active = true  // 实例级标志，防止卸载后 initLayers 异步续体仍操作地图

  function applyCoordSys(gj: GeoJSON.FeatureCollection): GeoJSON.FeatureCollection {
    return BASEMAPS[settings.basemap].coordSys === 'wgs84' ? shiftCoords(gj, -0.01, 0.005) : gj
  }

  async function loadGeo(id: string): Promise<GeoJSON.FeatureCollection | null> {
    if (geoCache.has(id)) return geoCache.get(id)!
    try {
      const res = await fetch(`${SHAPES_BASE}/${id}.geojson`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const gj: GeoJSON.FeatureCollection = await res.json()
      geoCache.set(id, gj)  // 缓存原始坐标，坐标系偏移在使用时按当前底图计算
      return gj
    } catch { return null }
  }

  function showLayers(m: MaplibreMap) {
    if (!layersAdded) return
    try {
      m.setLayoutProperty('admin-sub-halo', 'visibility', 'visible')
      m.setLayoutProperty('admin-sub-line', 'visibility', 'visible')
      m.setLayoutProperty('admin-outer-halo',      'visibility', 'visible')
      m.setLayoutProperty('admin-outer-line',      'visibility', 'visible')
    } catch {}
  }

  function hideLayers(m: MaplibreMap) {
    if (!layersAdded) return
    try {
      m.setLayoutProperty('admin-sub-halo', 'visibility', 'none')
      m.setLayoutProperty('admin-sub-line', 'visibility', 'none')
      m.setLayoutProperty('admin-outer-halo',      'visibility', 'none')
      m.setLayoutProperty('admin-outer-line',      'visibility', 'none')
    } catch {}
  }

  async function initLayers(m: MaplibreMap): Promise<void> {
    if (!active) return  // 卸载后 load 事件仍触发时（如切回已有图层）直接返回

    if (layersAdded) {
      if (settings.showAdminBoundary) showLayers(m)
      return
    }

    const [overallGeo, ...prefGeos] = await Promise.all([
      loadGeo(OVERALL_REGION_ID),
      ...SUB_REGION_IDS.map(id => loadGeo(id)),
    ])

    if (!active) return  // GeoJSON 加载完成时组件可能已卸载
    if (!overallGeo) return

    const prefFeatures: GeoJSON.Feature[] = []
    prefGeos.forEach(gj => { if (gj) prefFeatures.push(...gj.features) })

    m.addSource('admin-boundary-outer', {
      type: 'geojson',
      data: applyCoordSys(overallGeo),
    })
    m.addSource('admin-boundary-sub', {
      type: 'geojson',
      data: applyCoordSys({ type: 'FeatureCollection', features: prefFeatures }),
    })

    // 下级区域分界（视觉权重低，先加层在下方）
    m.addLayer({
      id: 'admin-sub-halo', type: 'line', source: 'admin-boundary-sub',
      paint: { 'line-color': 'rgba(0,0,0,0.4)', 'line-width': 1.5 },
    })
    m.addLayer({
      id: 'admin-sub-line', type: 'line', source: 'admin-boundary-sub',
      paint: { 'line-color': 'rgba(255,255,255,0.5)', 'line-width': 0.75 },
    })

    // 全区外轮廓（视觉权重高，后加层在上方）
    m.addLayer({
      id: 'admin-outer-halo', type: 'line', source: 'admin-boundary-outer',
      paint: { 'line-color': 'rgba(0,0,0,0.5)', 'line-width': 2.5 },
    })
    m.addLayer({
      id: 'admin-outer-line', type: 'line', source: 'admin-boundary-outer',
      paint: { 'line-color': 'rgba(255,255,255,0.85)', 'line-width': 1.5 },
    })

    layersAdded = true
    if (!settings.showAdminBoundary) hideLayers(m)
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

  // 底图切换时用原始缓存重新计算偏移并更新 source 数据
  watch(
    () => settings.basemap,
    async () => {
      const m = map.value
      if (!m || !layersAdded) return
      const [overallGeo, ...prefGeos] = await Promise.all([
        loadGeo(OVERALL_REGION_ID),
        ...SUB_REGION_IDS.map(id => loadGeo(id)),
      ])
      if (!overallGeo) return
      const prefFeatures: GeoJSON.Feature[] = []
      prefGeos.forEach(gj => { if (gj) prefFeatures.push(...gj.features) })
      try {
        (m.getSource('admin-boundary-outer') as GeoJSONSource)?.setData(applyCoordSys(overallGeo))
        ;(m.getSource('admin-boundary-sub') as GeoJSONSource)?.setData(
          applyCoordSys({ type: 'FeatureCollection', features: prefFeatures }),
        )
      } catch {}
    },
  )

  // 设置开关实时响应
  watch(
    () => settings.showAdminBoundary,
    (show) => {
      const m = map.value
      if (!m) return
      if (show) showLayers(m)
      else hideLayers(m)
    },
  )

  onUnmounted(() => { active = false; const m = map.value; if (m) hideLayers(m) })
}
