import { watch, onUnmounted } from 'vue'
import type { Map as MaplibreMap, GeoJSONSource } from 'maplibre-gl'
import { useMap } from './useMap'
import { useRegionStore } from '@/stores/region'
import { BASEMAPS } from '@/config/basemaps'
import { useSettingsStore } from '@/stores/settings'
import type { RegionId } from '@/types'

const SHAPES_BASE = (import.meta.env.VITE_SHAPES_BASE as string | undefined) ?? '/shapes'

// GCJ-02 → WGS-84 rough reverse (对应 frontend.md DEC-005)
function shiftCoords(geojson: GeoJSON.FeatureCollection, dx: number, dy: number): GeoJSON.FeatureCollection {
  function shiftRing(ring: number[][]): number[][] {
    return ring.map(([lon, lat]) => [lon + dx, lat + dy])
  }
  function shiftGeom(g: GeoJSON.Geometry): GeoJSON.Geometry {
    if (g.type === 'Polygon') return { ...g, coordinates: g.coordinates.map(shiftRing) }
    if (g.type === 'MultiPolygon') return { ...g, coordinates: g.coordinates.map(p => p.map(shiftRing)) }
    return g
  }
  return {
    ...geojson,
    features: geojson.features.map(f => ({ ...f, geometry: shiftGeom(f.geometry as GeoJSON.Geometry) })),
  }
}

// Per-region GeoJSON cache
const geoCache = new Map<RegionId, GeoJSON.FeatureCollection>()

export function useRegionLayer() {
  const { map }    = useMap()
  const regionStore = useRegionStore()
  const settings   = useSettingsStore()

  let layersAdded = false

  // ── Load + cache a region's GeoJSON ────────────────────────────────────────

  async function loadGeo(regionId: RegionId): Promise<GeoJSON.FeatureCollection | null> {
    if (geoCache.has(regionId)) return geoCache.get(regionId)!
    try {
      const res = await fetch(`${SHAPES_BASE}/${regionId}.geojson`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      let gj: GeoJSON.FeatureCollection = await res.json()
      // If basemap is WGS-84, shift GCJ-02 shapes backwards ~
      const bm = BASEMAPS[settings.basemap]
      if (bm.coordSys === 'wgs84') {
        gj = shiftCoords(gj, -0.01, 0.005)
      }
      geoCache.set(regionId, gj)
      return gj
    } catch {
      return null
    }
  }

  // ── Build combined GeoJSON (xizang outline + all prefectures) ─────────────

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

  // ── Init map layers ────────────────────────────────────────────────────────

  async function initLayers(m: MaplibreMap): Promise<void> {
    if (layersAdded) return
    const gj = await buildAllGeo()

    m.addSource('regions', { type: 'geojson', data: gj, promoteId: 'region_id' })

    // Fill layer (hover / selected highlight)
    m.addLayer({
      id: 'region-fill',
      type: 'fill',
      source: 'regions',
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

    // Outline layer
    m.addLayer({
      id: 'region-line',
      type: 'line',
      source: 'regions',
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

  // ── Highlight helpers ──────────────────────────────────────────────────────

  let prevSelected: string | null = null

  function applySelection(m: MaplibreMap, regionId: RegionId) {
    if (!layersAdded) return
    if (prevSelected) {
      m.setFeatureState({ source: 'regions', id: prevSelected }, { selected: false })
    }
    m.setFeatureState({ source: 'regions', id: regionId }, { selected: true })
    prevSelected = regionId
  }

  // ── Hover state ────────────────────────────────────────────────────────────

  let hoveredId: string | null = null

  function onMouseMove(e: maplibregl.MapMouseEvent) {
    const m = map.value
    if (!m || !layersAdded) return
    const features = m.queryRenderedFeatures(e.point, { layers: ['region-fill'] })
    const newId = (features[0]?.properties?.['region_id'] ?? null) as string | null
    if (newId === hoveredId) return
    if (hoveredId) m.setFeatureState({ source: 'regions', id: hoveredId }, { hover: false })
    hoveredId = newId
    if (newId) m.setFeatureState({ source: 'regions', id: newId }, { hover: true })
    m.getCanvas().style.cursor = newId ? 'pointer' : ''
  }

  function onMouseLeave() {
    const m = map.value
    if (!m || !hoveredId) return
    m.setFeatureState({ source: 'regions', id: hoveredId }, { hover: false })
    hoveredId = null
    m.getCanvas().style.cursor = ''
  }

  function onMapClick(e: maplibregl.MapMouseEvent) {
    const m = map.value
    if (!m || !layersAdded) return
    const features = m.queryRenderedFeatures(e.point, { layers: ['region-fill'] })
    const clickedId = features[0]?.properties?.['region_id'] as RegionId | undefined
    if (clickedId && clickedId !== 'xizang') {
      regionStore.selectRegion(clickedId)
    }
  }

  // ── Setup ──────────────────────────────────────────────────────────────────

  function setup() {
    const m = map.value
    if (!m) return

    if (m.isStyleLoaded()) {
      initLayers(m)
    } else {
      m.once('load', () => initLayers(m))
    }

    m.on('mousemove', onMouseMove)
    m.on('mouseleave', onMouseLeave)
    m.on('click', onMapClick)
  }

  function teardown() {
    const m = map.value
    if (!m) return
    m.off('mousemove', onMouseMove)
    m.off('mouseleave', onMouseLeave)
    m.off('click', onMapClick)
  }

  setup()

  watch(() => regionStore.selRegionId, (id) => {
    const m = map.value
    if (m) applySelection(m, id)
  })

  onUnmounted(teardown)

  return { onMapClick }
}

// workaround for maplibregl type
declare const maplibregl: { MapMouseEvent: new (...a: any[]) => any }
