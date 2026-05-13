import { shallowRef, readonly, watch } from 'vue'
import maplibregl, { type Map as MaplibreMap, type ImageSource, type RasterTileSource } from 'maplibre-gl'
import { useSettingsStore } from '@/stores/settings'
import { BASEMAPS } from '@/config/basemaps'
import type { BasemapConfig } from '@/types'

// 格点 ImageSource 的四角坐标（[tl, tr, br, bl]，MapLibre 顺序）
// 格点原始边界：lon 75–100°E, lat 25–40°N（外扩 0.5° 覆盖边缘格点单元）
function getGridCorners(basemap: BasemapConfig): [[number, number], [number, number], [number, number], [number, number]] {
  const [w, e, s, n] = [75.0, 100.0, 25.0, 40.0]
  const [dx, dy] = basemap.coordSys === 'gcj02' ? [0.01, -0.005] : [0, 0]
  return [
    [w + dx, n + dy],
    [e + dx, n + dy],
    [e + dx, s + dy],
    [w + dx, s + dy],
  ]
}

// 1×1 透明 PNG，用于 grid-overlay ImageSource 初始占位
const TRANSPARENT_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQ' +
  'AABjkB6QAAAABJRU5ErkJggg=='

// ─── 模块级单例：grid / region 模块共享同一 Map 实例 ───────────────────────

const _map = shallowRef<MaplibreMap | null>(null)

export function useMap() {
  const settings = useSettingsStore()

  function initMap(container: HTMLElement): void {
    if (_map.value) return  // 已初始化，不重复创建

    const basemap = BASEMAPS[settings.basemap]

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
      center: [87.75, 32.5],   // 西藏中心
      zoom: 5,
      minZoom: 3,
      maxZoom: 12,
      attributionControl: false,
    })

    map.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      'bottom-right',
    )

    // 地图加载完成后，添加格点图层占位 source/layer（useGridLayer 将更新 url）
    map.on('load', () => {
      map.addSource('grid-overlay', {
        type: 'image',
        url: TRANSPARENT_PNG,
        coordinates: getGridCorners(basemap),
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
  }

  function destroyMap(): void {
    _map.value?.remove()
    _map.value = null
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
        const imgSrc = map.getSource('grid-overlay') as ImageSource | undefined
        imgSrc?.setCoordinates(getGridCorners(basemap))
      }
    },
  )

  return {
    map: readonly(_map),
    initMap,
    destroyMap,
  }
}
