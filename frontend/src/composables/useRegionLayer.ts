import { shallowRef, watch, onUnmounted } from 'vue'
import type { Map as MaplibreMap, GeoJSONSource } from 'maplibre-gl'
import { useMap } from './useMap'
import { useRegionStore } from '@/stores/region'
import { BASEMAPS } from '@/config/basemaps'
import { useSettingsStore } from '@/stores/settings'
import { OVERALL_REGION_ID, SUB_REGION_IDS, ALL_REGION_IDS, OVERALL_LABEL } from '@/config/regions'
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

const DISTRICT_IDS: readonly RegionId[] = SUB_REGION_IDS

const geoCache  = new Map<RegionId, GeoJSON.FeatureCollection>()
let   layersAdded   = false
let   prevSelected: string | null = null
let   hoveredId:    string | null = null

// 当前 hover 的区域信息，供 RegionModule 渲染 tooltip
export const hoverInfo = shallowRef<{ x: number; y: number; name: string } | null>(null)


// ── 主体包围盒 ────────────────────────────────────────────────────────────────
//
// 海南的 GeoJSON 含 108 个南海岛礁多边形（最南 7.3°N），在 1° 网格下只有几个
// 像素；直接取全量 bbox 会把视野拽到整个南海。改为只框住「主体」：
//
//   主体 = 面积最大的多边形
//   保留 = 面积 ≥ 主体的 MIN_AREA_FRAC，或外环 bbox 中心落在主体外扩 NEAR_PAD 内
//
// 两个判据缺一不可：只按「靠近主体」会把华南全区里的海南本岛甩掉（其中心离
// 大陆 bbox 恰好 1.02°）；只按「面积最大一块」会把香港的 137 个碎岛切成一块。
// 几何本身不做裁剪 —— 岛礁在地图上照常绘制，只是不参与取景。

const NEAR_PAD = 1.0        // 度
const MIN_AREA_FRAC = 0.05  // 相对主体面积

// 反向遮罩挖洞时忽略面积过小的环（度²，1e-3 ≈ 12 km²）。
//
// 原因是稳健性：世界外框 + 数百个洞会让 MapLibre 的 earcut 三角剖分产生退化
// 三角形，表现为区域中间横穿一条黑色粗线。华南全区有 313 个环，其中 220 个是
// 南海小岛礁；实测保留 94 个（≥ 1e-3）在 z4–z10 均正常，保留 176 个（≥ 1e-4）
// 仍会复现该伪影。西藏各区域的环都远大于此阈值，行为不受影响。
//
// 代价（已知限制）：z9 以下这些地块不足 10 像素，看不出差别；但放大到 z10+ 看
// 港澳时，个别 12 km² 以下的小岛（如蒲台岛）不会被挖亮，呈现为有白色轮廓的暗块。
// 轮廓本身由 region-line 图层正常绘制，选区、统计与取景均不受影响。
const MASK_MIN_RING_AREA = 1e-3

interface Bounds { minLon: number; minLat: number; maxLon: number; maxLat: number }

// 环的带符号面积（度²）。> 0 为逆时针，< 0 为顺时针。
function signedRingArea(ring: number[][]): number {
  let sum = 0
  for (let i = 0; i < ring.length - 1; i++) {
    sum += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]
  }
  return sum / 2
}

// 外环围成的面积（度²，仅用于多边形之间比大小，不是真实地表面积）
function ringArea(ring: number[][]): number {
  return Math.abs(signedRingArea(ring))
}

// 把环调整为指定绕向。
//
// MapLibre 的 classifyRings 按**绕向**把环分组：与首环同向的另起一个多边形，
// 反向的才算作洞。因此挖洞遮罩必须保证世界外框与各洞的绕向相反。
// 不能依赖数据源的绕向 —— 高德原始 GeoJSON 的外环是逆时针，而
// scripts/prepare_shapes.py 经 shapely 合并输出的是顺时针，后者会让整个遮罩
// 三角剖分错乱（表现为区域中间横穿一条黑色粗线）。
function orient(ring: number[][], wantCCW: boolean): number[][] {
  return (signedRingArea(ring) > 0) === wantCCW ? ring : [...ring].reverse()
}

function ringBounds(ring: number[][]): Bounds {
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity
  for (const [lon, lat] of ring) {
    if (lon < minLon) minLon = lon
    if (lon > maxLon) maxLon = lon
    if (lat < minLat) minLat = lat
    if (lat > maxLat) maxLat = lat
  }
  return { minLon, minLat, maxLon, maxLat }
}

// 收集 FeatureCollection 中所有多边形的外环
function outerRings(gj: GeoJSON.FeatureCollection): number[][][] {
  const rings: number[][][] = []
  for (const f of gj.features) {
    const g = f.geometry as GeoJSON.Geometry
    if (g.type === 'Polygon')           rings.push(g.coordinates[0])
    else if (g.type === 'MultiPolygon') g.coordinates.forEach(poly => rings.push(poly[0]))
  }
  return rings
}

function mainBodyBounds(gj: GeoJSON.FeatureCollection): Bounds | null {
  const rings = outerRings(gj)
  if (rings.length === 0) return null

  const parts = rings.map(r => ({ area: ringArea(r), b: ringBounds(r) }))
  parts.sort((a, b) => b.area - a.area)

  const main = parts[0]
  const near = {
    minLon: main.b.minLon - NEAR_PAD, maxLon: main.b.maxLon + NEAR_PAD,
    minLat: main.b.minLat - NEAR_PAD, maxLat: main.b.maxLat + NEAR_PAD,
  }

  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity
  for (const { area, b } of parts) {
    const cx = (b.minLon + b.maxLon) / 2
    const cy = (b.minLat + b.maxLat) / 2
    const isNear = cx >= near.minLon && cx <= near.maxLon && cy >= near.minLat && cy <= near.maxLat
    if (area < MIN_AREA_FRAC * main.area && !isNear) continue
    if (b.minLon < minLon) minLon = b.minLon
    if (b.maxLon > maxLon) maxLon = b.maxLon
    if (b.minLat < minLat) minLat = b.minLat
    if (b.maxLat > maxLat) maxLat = b.maxLat
  }
  return isFinite(minLon) ? { minLon, minLat, maxLon, maxLat } : null
}

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
    const overallGeo = await loadGeo(OVERALL_REGION_ID)
    if (!overallGeo?.features.length) return null
    const geom = overallGeo.features[0].geometry as GeoJSON.Geometry
    const worldRing: number[][] = [[-180, -90], [180, -90], [180, 90], [-180, 90], [-180, -90]]
    let outerRings: number[][][]
    if (geom.type === 'Polygon')           outerRings = [geom.coordinates[0]]
    else if (geom.type === 'MultiPolygon') outerRings = geom.coordinates.map(p => p[0])
    else return null
    outerRings = outerRings.filter(r => ringArea(r) >= MASK_MIN_RING_AREA)
    if (outerRings.length === 0) return null
    return {
      type: 'Feature', properties: {},
      geometry: {
        type: 'Polygon',
        // 外框逆时针、各洞顺时针 —— 见 orient() 注释
        coordinates: [orient(worldRing, true), ...outerRings.map(r => orient(r, false))],
      },
    }
  }

  async function buildAllGeo(): Promise<GeoJSON.FeatureCollection> {
    const ids: readonly RegionId[] = ALL_REGION_IDS
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
    // buildAllGeo 已把全区放入缓存，buildMaskGeo 直接命中
    const maskFeature = await buildMaskGeo()

    m.addSource('regions', { type: 'geojson', data: gj, promoteId: 'region_id' })

    // 全区以外的反向遮罩（挖洞多边形）
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

    // 填充层：全区始终透明；下级区域选中/hover 透明，默认暗色遮罩
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
          ['==', ['get', 'region_id'], OVERALL_REGION_ID],            0,
          ['boolean', ['feature-state', 'selected'], false], 0,
          ['boolean', ['feature-state', 'hover'],    false], 0.18,
          ['boolean', ['feature-state', 'dimmed'],   false], 0.8,
          0,
        ],
      },
    })

    // 暗色光晕层：默认只显示全区和选中区域，hover 时所有下级区域显现
    m.addLayer({
      id: 'region-line-halo', type: 'line', source: 'regions',
      paint: {
        'line-color': 'rgba(0,0,0,0.65)',
        'line-opacity': [
          'case',
          ['==', ['get', 'region_id'], OVERALL_REGION_ID],            1,
          ['boolean', ['feature-state', 'selected'], false], 1,
          ['boolean', ['feature-state', 'lineVisible'], false], 1,
          0,
        ],
        'line-width': [
          'case',
          ['==', ['get', 'region_id'], OVERALL_REGION_ID],            3,
          ['boolean', ['feature-state', 'hover'],    false], 4,
          ['boolean', ['feature-state', 'selected'], false], 3,
          2,
        ],
      },
    })

    // 主线：全区和选中区域白线，hover 时加粗，其余细灰
    m.addLayer({
      id: 'region-line', type: 'line', source: 'regions',
      paint: {
        'line-color': [
          'case',
          ['==', ['get', 'region_id'], OVERALL_REGION_ID],            'rgba(255,255,255,0.85)',
          ['boolean', ['feature-state', 'hover'],    false], 'rgba(255,255,255,0.85)',
          ['boolean', ['feature-state', 'selected'], false], 'rgba(255,255,255,0.85)',
          'rgba(180,180,180,0.55)',
        ],
        'line-opacity': [
          'case',
          ['==', ['get', 'region_id'], OVERALL_REGION_ID],            1,
          ['boolean', ['feature-state', 'selected'], false], 1,
          ['boolean', ['feature-state', 'lineVisible'], false], 1,
          0,
        ],
        'line-width': [
          'case',
          ['==', ['get', 'region_id'], OVERALL_REGION_ID],            1.5,
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
    const b = mainBodyBounds(gj)
    if (!b) return
    m.fitBounds([[b.minLon, b.minLat], [b.maxLon, b.maxLat]], { padding: 60, duration: animate ? 800 : 0 })
  }

  function applySelection(m: MaplibreMap, regionId: RegionId, animate = false) {
    if (!layersAdded) return
    if (prevSelected) m.setFeatureState({ source: 'regions', id: prevSelected }, { selected: false })
    m.setFeatureState({ source: 'regions', id: regionId }, { selected: true })
    prevSelected = regionId
    // 选中全区时不遮罩任何下级区域；选中某个下级区域时遮罩其余
    const dimDistricts = regionId !== OVERALL_REGION_ID
    for (const id of DISTRICT_IDS) {
      m.setFeatureState({ source: 'regions', id }, { dimmed: dimDistricts && id !== regionId })
    }
    flyToRegion(m, regionId, animate)
  }

  function regionName(id: string): string {
    if (id === OVERALL_REGION_ID) return OVERALL_LABEL
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
    if (clickedId && clickedId !== OVERALL_REGION_ID) regionStore.selectRegion(clickedId)
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
