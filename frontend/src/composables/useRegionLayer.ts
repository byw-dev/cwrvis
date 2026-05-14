import { shallowRef, watch, onUnmounted } from 'vue'
import type { Map as MaplibreMap, GeoJSONSource } from 'maplibre-gl'
import { useMap } from './useMap'
import { useRegionStore } from '@/stores/region'
import { BASEMAPS } from '@/config/basemaps'
import { useSettingsStore } from '@/stores/settings'
import type { RegionId } from '@/types'

const SHAPES_BASE = (import.meta.env.VITE_SHAPES_BASE as string | undefined) ?? '/shapes'

// GCJ-02 → WGS-84 rough reverse
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

// ── Module-level singletons（跨组件挂载/卸载保持状态）───────────────────────

const geoCache  = new Map<RegionId, GeoJSON.FeatureCollection>()
let   layersAdded   = false
let   prevSelected: string | null = null
let   hoveredId:    string | null = null

// 当前 hover 的区域信息，供 RegionModule 渲染 tooltip
export const hoverInfo = shallowRef<{ x: number; y: number; name: string } | null>(null)

// ── Composable ───────────────────────────────────────────────────────────────

export function useRegionLayer() {
  const { map }    = useMap()
  const regionStore = useRegionStore()
  const settings   = useSettingsStore()

  // ── Load + cache a region's GeoJSON ───────────────────────────────────────

  async function loadGeo(regionId: RegionId): Promise<GeoJSON.FeatureCollection | null> {
    if (geoCache.has(regionId)) return geoCache.get(regionId)!
    try {
      const res = await fetch(`${SHAPES_BASE}/${regionId}.geojson`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      let gj: GeoJSON.FeatureCollection = await res.json()
      const bm = BASEMAPS[settings.basemap]
      if (bm.coordSys === 'wgs84') gj = shiftCoords(gj, -0.01, 0.005)
      geoCache.set(regionId, gj)
      return gj
    } catch { return null }
  }

  async function buildAllGeo(): Promise<GeoJSON.FeatureCollection> {
    const ids: RegionId[] = ['xizang', 'lasa', 'rikaze', 'shannan', 'linzhi', 'changdu', 'naqu', 'ali']
    const results = await Promise.all(ids.map(id => loadGeo(id)))
    const features: GeoJSON.Feature[] = []
    for (let i = 0; i < ids.length; i++) {
      const gj = results[i]
      if (!gj) continue
      gj.features.forEach(f => features.push({ ...f, properties: { ...f.properties, region_id: ids[i] } }))
    }
    return { type: 'FeatureCollection', features }
  }

  // ── Init / show / hide layers ──────────────────────────────────────────────

  async function initLayers(m: MaplibreMap): Promise<void> {
    if (layersAdded) {
      // 已创建过，只需恢复可见
      m.setLayoutProperty('region-fill', 'visibility', 'visible')
      m.setLayoutProperty('region-line', 'visibility', 'visible')
      applySelection(m, regionStore.selRegionId)
      return
    }

    const gj = await buildAllGeo()
    m.addSource('regions', { type: 'geojson', data: gj, promoteId: 'region_id' })

    m.addLayer({
      id: 'region-fill', type: 'fill', source: 'regions',
      paint: {
        'fill-color': '#58e0ff',
        'fill-opacity': [
          'case',
          ['boolean', ['feature-state', 'selected'], false], 0.25,
          ['boolean', ['feature-state', 'hover'],    false], 0.12,
          0,
        ],
      },
    })

    m.addLayer({
      id: 'region-line', type: 'line', source: 'regions',
      paint: {
        'line-color': [
          'case',
          ['boolean', ['feature-state', 'selected'], false], 'rgba(88,224,255,0.8)',
          ['==', ['get', 'region_id'], 'xizang'],            'rgba(88,224,255,0.5)',
          'rgba(88,224,255,0.2)',
        ],
        'line-width': [
          'case',
          ['boolean', ['feature-state', 'selected'], false], 2,
          ['==', ['get', 'region_id'], 'xizang'], 1.5,
          1,
        ],
      },
    })

    layersAdded = true
    applySelection(m, regionStore.selRegionId)
  }

  function hideLayers(m: MaplibreMap) {
    if (!layersAdded) return
    try {
      m.setLayoutProperty('region-fill', 'visibility', 'none')
      m.setLayoutProperty('region-line', 'visibility', 'none')
    } catch { /* map may be removed */ }
  }

  // ── Feature state helpers ─────────────────────────────────────────────────

  function applySelection(m: MaplibreMap, regionId: RegionId) {
    if (!layersAdded) return
    if (prevSelected) m.setFeatureState({ source: 'regions', id: prevSelected }, { selected: false })
    m.setFeatureState({ source: 'regions', id: regionId }, { selected: true })
    prevSelected = regionId
  }

  function regionName(id: string): string {
    if (id === 'xizang') return '西藏自治区（全区）'
    return regionStore.regions.find(r => r.region_id === id)?.name ?? id
  }

  // ── Event handlers ────────────────────────────────────────────────────────

  function onMouseMove(e: any) {
    const m = map.value
    if (!m || !layersAdded) return
    const features = m.queryRenderedFeatures(e.point, { layers: ['region-fill'] })
    const newId = (features[0]?.properties?.['region_id'] ?? null) as string | null
    if (newId === hoveredId) {
      // Update position even when same region
      if (newId) hoverInfo.value = { x: e.originalEvent.clientX, y: e.originalEvent.clientY, name: regionName(newId) }
      return
    }
    if (hoveredId) m.setFeatureState({ source: 'regions', id: hoveredId }, { hover: false })
    hoveredId = newId
    if (newId) {
      m.setFeatureState({ source: 'regions', id: newId }, { hover: true })
      hoverInfo.value = { x: e.originalEvent.clientX, y: e.originalEvent.clientY, name: regionName(newId) }
    } else {
      hoverInfo.value = null
    }
    m.getCanvas().style.cursor = newId ? 'pointer' : ''
  }

  function onMouseLeave() {
    const m = map.value
    if (!m || !hoveredId) return
    m.setFeatureState({ source: 'regions', id: hoveredId }, { hover: false })
    hoveredId = null
    hoverInfo.value = null
    m.getCanvas().style.cursor = ''
  }

  function onMapClick(e: any) {
    const m = map.value
    if (!m || !layersAdded) return
    const features = m.queryRenderedFeatures(e.point, { layers: ['region-fill'] })
    const clickedId = features[0]?.properties?.['region_id'] as RegionId | undefined
    if (clickedId && clickedId !== 'xizang') regionStore.selectRegion(clickedId)
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  function setup() {
    const m = map.value
    if (!m) return
    if (m.isStyleLoaded()) { initLayers(m) } else { m.once('load', () => initLayers(m)) }
    m.on('mousemove', onMouseMove)
    m.on('mouseleave', onMouseLeave)
    m.on('click', onMapClick)
  }

  function teardown() {
    const m = map.value
    if (m) {
      m.off('mousemove', onMouseMove)
      m.off('mouseleave', onMouseLeave)
      m.off('click', onMapClick)
      // 清除悬停状态
      if (hoveredId) { m.setFeatureState({ source: 'regions', id: hoveredId }, { hover: false }); hoveredId = null }
      hoverInfo.value = null
      m.getCanvas().style.cursor = ''
      // 隐藏图层（不销毁，下次进入模块时直接复用）
      hideLayers(m)
    }
  }

  setup()

  watch(() => regionStore.selRegionId, (id) => {
    const m = map.value
    if (m) applySelection(m, id)
  })

  onUnmounted(teardown)

  return { hoverInfo }
}
