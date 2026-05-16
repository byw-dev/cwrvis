import { shallowRef, shallowReadonly, watch } from 'vue'
import maplibregl, { type Map as MaplibreMap, type CanvasSource, type RasterTileSource } from 'maplibre-gl'
import { useSettingsStore } from '@/stores/settings'
import { useMetaStore } from '@/stores/meta'
import { BASEMAPS } from '@/config/basemaps'
import { computeGridBounds } from '@/utils/grid'
import type { BasemapConfig } from '@/types'

// Fallback grid axes used when meta.json has not yet loaded at initMap time.
// Values match the current 1°×1° dataset (25 lon × 15 lat, centers 75.5–99.5°E / 39.5–25.5°N).
// Once meta loads the overlay corners are updated via setCoordinates automatically.
// NOTE: canvas pixel dimensions are fixed at initMap time; if a future dataset has
// different grid shape, ensure meta is loaded before initMap is called.
const FALLBACK_LATS = Array.from({ length: 15 }, (_, i) => 39.5 - i) as number[]
const FALLBACK_LONS = Array.from({ length: 25 }, (_, i) => 75.5 + i) as number[]

const MAX_CANVAS_PIXELS = 400_000
const MIN_GRID_SCALE    = 10
const MAX_GRID_SCALE    = 48

// Compute integer pixel scale k so the canvas is nLon×k by nLat×k (isotropic).
// Exported for use in useGridLayer (Worker targetW/targetH must match canvas size).
export function computeGridScale(nLon: number, nLat: number): number {
  const k = Math.floor(Math.sqrt(MAX_CANVAS_PIXELS / (nLon * nLat)))
  return Math.max(MIN_GRID_SCALE, Math.min(MAX_GRID_SCALE, k))
}

// Compute MapLibre canvas source corners from grid metadata (cell-boundary extent).
// dx/dy: rough WGS-84 → GCJ-02 shift to align the WGS-84 grid canvas with GCJ-02 tiles.
// Region shapes (native GCJ-02) apply the inverse shift in useRegionLayer when needed.
// TODO: if shape data source changes coordinate system, keep both offsets in sync.
function getGridCorners(
  lats: number[],
  lons: number[],
  basemap: BasemapConfig,
): [[number, number], [number, number], [number, number], [number, number]] {
  const { lonMin: w, lonMax: e, latMin: s, latMax: n } = computeGridBounds(lats, lons)
  const [dx, dy] = basemap.coordSys === 'gcj02' ? [0.01, -0.005] : [0, 0]
  return [
    [w + dx, n + dy],
    [e + dx, n + dy],
    [e + dx, s + dy],
    [w + dx, s + dy],
  ]
}

// ─── Module-level singletons：grid / region 模块共享同一 Map 实例 ───────────────────────

const _map        = shallowRef<MaplibreMap | null>(null)
const _gridCanvas = shallowRef<HTMLCanvasElement | null>(null)

export function useMap() {
  const settings  = useSettingsStore()
  const metaStore = useMetaStore()

  function currentLats() { return metaStore.grid?.lat ?? FALLBACK_LATS }
  function currentLons() { return metaStore.grid?.lon ?? FALLBACK_LONS }

  function initMap(container: HTMLElement): void {
    if (_map.value) return

    const basemap = BASEMAPS[settings.basemap]
    const lats = currentLats()
    const lons = currentLons()
    const k = computeGridScale(lons.length, lats.length)

    // Canvas source 不依赖异步图片加载，draw 操作同步完成后 play() 即可显示
    const canvas = document.createElement('canvas')
    canvas.width  = lons.length * k
    canvas.height = lats.length * k
    canvas.style.cssText = 'position:absolute;width:0;height:0;opacity:0;pointer-events:none'
    document.body.appendChild(canvas)
    _gridCanvas.value = canvas

    const map = new maplibregl.Map({
      container,
      style: {
        version: 8,
        glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
        sources: {
          basemap: {
            type: 'raster',
            tiles: basemap.tiles,
            tileSize: 256,
            attribution: basemap.attribution,
            maxzoom: basemap.maxZoom,
          },
        },
        layers: [
          { id: 'basemap-layer', type: 'raster', source: 'basemap' },
        ],
      },
      center: [87.75, 32.5],
      zoom: 5,
      minZoom: 3,
      maxZoom: 12,
      attributionControl: false,
    })

    map.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      'bottom-right',
    )

    map.on('load', () => {
      map.addSource('grid-overlay', {
        type: 'canvas',
        canvas,
        coordinates: getGridCorners(currentLats(), currentLons(), basemap),
        animate: true,   // 持续读取 canvas，避免模块切换时 play/pause 竞态导致图层消失
      })
      map.addLayer({
        id: 'grid-overlay-layer',
        type: 'raster',
        source: 'grid-overlay',
        paint: {
          'raster-opacity': 0.8,
          'raster-fade-duration': 0,
        },
      })
    })

    _map.value = map
    ;(window as any).__devMap = map
  }

  function destroyMap(): void {
    _map.value?.remove()
    _map.value = null
    _gridCanvas.value?.remove()
    _gridCanvas.value = null
  }

  // 底图切换：更新瓦片 URL + 格点图层四角坐标
  watch(
    () => settings.basemap,
    (newId) => {
      const map = _map.value
      if (!map) return
      const basemap = BASEMAPS[newId]

      const rasterSrc = map.getSource('basemap') as RasterTileSource | undefined
      rasterSrc?.setTiles(basemap.tiles)

      if (map.isStyleLoaded()) {
        const canvasSrc = map.getSource('grid-overlay') as CanvasSource | undefined
        canvasSrc?.setCoordinates(getGridCorners(currentLats(), currentLons(), basemap))
      }
    },
  )

  // meta.json 加载完毕后修正 overlay 四角坐标（处理 initMap 先于 meta 就绪的竞态）
  watch(
    () => metaStore.grid,
    (grid) => {
      if (!grid) return
      const map = _map.value
      if (!map?.isStyleLoaded()) return
      const canvasSrc = map.getSource('grid-overlay') as CanvasSource | undefined
      canvasSrc?.setCoordinates(getGridCorners(grid.lat, grid.lon, BASEMAPS[settings.basemap]))
    },
  )

  return {
    map: shallowReadonly(_map),
    gridCanvas: shallowReadonly(_gridCanvas),
    initMap,
    destroyMap,
  }
}
