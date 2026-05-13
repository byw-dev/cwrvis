import { shallowRef, shallowReadonly, watch } from 'vue'
import maplibregl, { type Map as MaplibreMap, type CanvasSource, type RasterTileSource } from 'maplibre-gl'
import { useSettingsStore } from '@/stores/settings'
import { BASEMAPS } from '@/config/basemaps'
import type { BasemapConfig } from '@/types'

// 格点覆盖层的四角坐标（[tl, tr, br, bl]，MapLibre 顺序）
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

// ─── 模块级单例：grid / region 模块共享同一 Map 实例 ───────────────────────

const _map = shallowRef<MaplibreMap | null>(null)
// Canvas source 不依赖异步图片加载，draw 操作同步完成后 play() 即可显示
const _gridCanvas = shallowRef<HTMLCanvasElement | null>(null)

export function useMap() {
  const settings = useSettingsStore()

  function initMap(container: HTMLElement): void {
    if (_map.value) return  // 已初始化，不重复创建

    const basemap = BASEMAPS[settings.basemap]

    // 与 Worker targetW/targetH 保持一致；须挂载到 DOM，MapLibre canvas source 才能正常读取
    const canvas = document.createElement('canvas')
    canvas.width  = 600
    canvas.height = 400
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
        coordinates: getGridCorners(basemap),
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
        canvasSrc?.setCoordinates(getGridCorners(basemap))
      }
    },
  )

  return {
    map: shallowReadonly(_map),
    gridCanvas: shallowReadonly(_gridCanvas),
    initMap,
    destroyMap,
  }
}
