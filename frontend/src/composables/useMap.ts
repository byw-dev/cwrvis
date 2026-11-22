import { shallowRef, shallowReadonly, watch } from 'vue'
import maplibregl, { type Map as MaplibreMap, type CanvasSource, type RasterTileSource } from 'maplibre-gl'
import { useSettingsStore } from '@/stores/settings'
import { useMetaStore } from '@/stores/meta'
import { BASEMAPS } from '@/config/basemaps'
import { computeGridBounds } from '@/utils/grid'
import type { BasemapConfig } from '@/types'

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

// Grid extent as a MapLibre LngLatBoundsLike, for the initial camera fit.
function gridBoundsLngLat(lats: number[], lons: number[]): [[number, number], [number, number]] {
  const { lonMin, lonMax, latMin, latMax } = computeGridBounds(lats, lons)
  return [[lonMin, latMin], [lonMax, latMax]]
}

// ─── Module-level singletons：grid / region 模块共享同一 Map 实例 ───────────────────────

const _map        = shallowRef<MaplibreMap | null>(null)
const _gridCanvas = shallowRef<HTMLCanvasElement | null>(null)

export function useMap() {
  const settings  = useSettingsStore()
  const metaStore = useMetaStore()

  function currentLats() { return metaStore.grid?.lat ?? [] }
  function currentLons() { return metaStore.grid?.lon ?? [] }

  function initMap(container: HTMLElement): void {
    if (_map.value) return

    // MapView 挂载在 App.vue 的 `v-if="metaStore.isReady"` 门后，此处 grid 必定就绪。
    // 保留守卫是为了让调用顺序被改动时立刻暴露，而不是静默退化成一份假格点。
    const grid = metaStore.grid
    if (!grid) {
      console.warn('[useMap] meta.grid 未就绪，跳过 initMap')
      return
    }

    const basemap = BASEMAPS[settings.basemap]
    const lats = grid.lat
    const lons = grid.lon
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
      // 初始视野由格点范围推导，换数据集时自动跟随，无需改代码
      bounds: gridBoundsLngLat(lats, lons),
      fitBoundsOptions: { padding: 24 },
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
