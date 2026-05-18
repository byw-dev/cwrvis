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

const DISTRICT_IDS: RegionId[] = ['lasa', 'rikaze', 'shannan', 'linzhi', 'changdu', 'naqu', 'ali']

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

  async function buildMaskGeo(): Promise<GeoJSON.Feature | null> {
    const xizangGeo = await loadGeo('xizang')
    if (!xizangGeo?.features.length) return null
    const geom = xizangGeo.features[0].geometry as GeoJSON.Geometry
    const worldRing: number[][] = [[-180, -90], [180, -90], [180, 90], [-180, 90], [-180, -90]]
    let outerRings: number[][][]
    if (geom.type === 'Polygon')           outerRings = [geom.coordinates[0]]
    else if (geom.type === 'MultiPolygon') outerRings = geom.coordinates.map(p => p[0])
    else return null
    return {
      type: 'Feature', properties: {},
      geometry: { type: 'Polygon', coordinates: [worldRing, ...outerRings] },
    }
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
      try { m.setLayoutProperty('region-mask-fill', 'visibility', 'visible') } catch {}
      m.setLayoutProperty('region-fill',      'visibility', 'visible')
      m.setLayoutProperty('region-line-halo', 'visibility', 'visible')
      m.setLayoutProperty('region-line',      'visibility', 'visible')
      applySelection(m, regionStore.selRegionId)
      return
    }

    const gj = await buildAllGeo()
    // buildAllGeo 已把 xizang 放入缓存，buildMaskGeo 直接命中
    const maskFeature = await buildMaskGeo()

    m.addSource('regions', { type: 'geojson', data: gj, promoteId: 'region_id' })

    // 西藏以外区域的反向遮罩（挖洞多边形）
    if (maskFeature) {
      m.addSource('region-mask', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [maskFeature] },
      })
      m.addLayer({
        id: 'region-mask-fill', type: 'fill', source: 'region-mask',
        paint: { 'fill-color': 'rgba(0,0,0,1)', 'fill-opacity': 0.8 },
      })
    }

    // 填充层：xizang 始终透明；地市选中/hover 透明，默认暗色遮罩
    m.addLayer({
      id: 'region-fill', type: 'fill', source: 'regions',
      paint: {
        'fill-color': [
          'case',
          ['boolean', ['feature-state', 'hover'], false], '#58e0ff',
          'rgba(0,0,0,1)',
        ],
        'fill-opacity': [
          'case',
          ['==', ['get', 'region_id'], 'xizang'],            0,
          ['boolean', ['feature-state', 'selected'], false], 0,
          ['boolean', ['feature-state', 'hover'],    false], 0.18,
          ['boolean', ['feature-state', 'dimmed'],   false], 0.8,
          0,
        ],
      },
    })

    // 暗色光晕层：默认只显示 xizang 和选中地市，hover 时所有地市显现
    m.addLayer({
      id: 'region-line-halo', type: 'line', source: 'regions',
      paint: {
        'line-color': 'rgba(0,0,0,0.65)',
        'line-opacity': [
          'case',
          ['==', ['get', 'region_id'], 'xizang'],            1,
          ['boolean', ['feature-state', 'selected'], false], 1,
          ['boolean', ['feature-state', 'lineVisible'], false], 1,
          0,
        ],
        'line-width': [
          'case',
          ['==', ['get', 'region_id'], 'xizang'],            3,
          ['boolean', ['feature-state', 'hover'],    false], 4,
          ['boolean', ['feature-state', 'selected'], false], 3,
          2,
        ],
      },
    })

    // 主线：xizang 和选中地市白线，hover 时加粗，其余细灰
    m.addLayer({
      id: 'region-line', type: 'line', source: 'regions',
      paint: {
        'line-color': [
          'case',
          ['==', ['get', 'region_id'], 'xizang'],            'rgba(255,255,255,0.85)',
          ['boolean', ['feature-state', 'hover'],    false], 'rgba(255,255,255,0.85)',
          ['boolean', ['feature-state', 'selected'], false], 'rgba(255,255,255,0.85)',
          'rgba(180,180,180,0.55)',
        ],
        'line-opacity': [
          'case',
          ['==', ['get', 'region_id'], 'xizang'],            1,
          ['boolean', ['feature-state', 'selected'], false], 1,
          ['boolean', ['feature-state', 'lineVisible'], false], 1,
          0,
        ],
        'line-width': [
          'case',
          ['==', ['get', 'region_id'], 'xizang'],            1.5,
          ['boolean', ['feature-state', 'hover'],    false], 2,
          ['boolean', ['feature-state', 'selected'], false], 1.5,
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
      m.setLayoutProperty('region-mask-fill', 'visibility', 'none')
      m.setLayoutProperty('region-fill',      'visibility', 'none')
      m.setLayoutProperty('region-line-halo', 'visibility', 'none')
      m.setLayoutProperty('region-line',      'visibility', 'none')
    } catch { /* map may be removed */ }
  }

  // ── Feature state helpers ─────────────────────────────────────────────────

  function flyToRegion(m: MaplibreMap, regionId: RegionId, animate: boolean) {
    const gj = geoCache.get(regionId)
    if (!gj) return
    let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity
    function scanRing(ring: number[][]) {
      for (const [lon, lat] of ring) {
        if (lon < minLon) minLon = lon; if (lon > maxLon) maxLon = lon
        if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat
      }
    }
    for (const f of gj.features) {
      const g = f.geometry as GeoJSON.Geometry
      if (g.type === 'Polygon')           g.coordinates.forEach(scanRing)
      else if (g.type === 'MultiPolygon') g.coordinates.forEach(p => p.forEach(scanRing))
    }
    if (!isFinite(minLon)) return
    m.fitBounds([[minLon, minLat], [maxLon, maxLat]], { padding: 60, duration: animate ? 800 : 0 })
  }

  function applySelection(m: MaplibreMap, regionId: RegionId, animate = false) {
    if (!layersAdded) return
    if (prevSelected) m.setFeatureState({ source: 'regions', id: prevSelected }, { selected: false })
    m.setFeatureState({ source: 'regions', id: regionId }, { selected: true })
    prevSelected = regionId
    // 选中 xizang（全区）时不遮罩任何地市；选中某地市时遮罩其余地市
    const dimDistricts = regionId !== 'xizang'
    for (const id of DISTRICT_IDS) {
      m.setFeatureState({ source: 'regions', id }, { dimmed: dimDistricts && id !== regionId })
    }
    flyToRegion(m, regionId, animate)
  }

  function regionName(id: string): string {
    if (id === 'xizang') return '西藏自治区（全区）'
    return regionStore.regions.find(r => r.region_id === id)?.name ?? id
  }

  // ── Event handlers ────────────────────────────────────────────────────────

  function setDistrictLinesVisible(m: MaplibreMap, visible: boolean) {
    for (const id of DISTRICT_IDS) m.setFeatureState({ source: 'regions', id }, { lineVisible: visible })
  }

  function onMouseMove(e: any) {
    const m = map.value
    if (!m || !layersAdded) return
    const features = m.queryRenderedFeatures(e.point, { layers: ['region-fill'] })
    const newId = (features[0]?.properties?.['region_id'] ?? null) as string | null
    if (newId === hoveredId) {
      if (newId) hoverInfo.value = { x: e.originalEvent.clientX, y: e.originalEvent.clientY, name: regionName(newId) }
      return
    }
    const wasHovering = hoveredId !== null
    if (hoveredId) m.setFeatureState({ source: 'regions', id: hoveredId }, { hover: false })
    hoveredId = newId
    if (newId) {
      m.setFeatureState({ source: 'regions', id: newId }, { hover: true })
      hoverInfo.value = { x: e.originalEvent.clientX, y: e.originalEvent.clientY, name: regionName(newId) }
      if (!wasHovering) setDistrictLinesVisible(m, true)
    } else {
      hoverInfo.value = null
      if (wasHovering) setDistrictLinesVisible(m, false)
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
    setDistrictLinesVisible(m, false)
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
      // 清除悬停状态和地市线可见性
      if (hoveredId) { m.setFeatureState({ source: 'regions', id: hoveredId }, { hover: false }); hoveredId = null }
      try { setDistrictLinesVisible(m, false) } catch {}
      hoverInfo.value = null
      m.getCanvas().style.cursor = ''
      // 隐藏图层（不销毁，下次进入模块时直接复用）
      hideLayers(m)
    }
  }

  setup()

  watch(() => regionStore.selRegionId, (id) => {
    const m = map.value
    if (m) applySelection(m, id, true)
  })

  onUnmounted(teardown)

  return { hoverInfo }
}
