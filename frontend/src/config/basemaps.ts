import type { BasemapConfig, BasemapId } from '@/types'

export const BASEMAPS: Record<BasemapId, BasemapConfig> = {
  osm: {
    id: 'osm',
    label: 'OpenStreetMap',
    tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
    coordSys: 'wgs84',
  },
  amap_street: {
    id: 'amap_street',
    label: '高德街道图',
    tiles: [
      'https://webrd01.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',
      'https://webrd02.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',
      'https://webrd03.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',
      'https://webrd04.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',
    ],
    attribution: '© 高德地图',
    maxZoom: 18,
    coordSys: 'gcj02',
  },
  amap_satellite: {
    id: 'amap_satellite',
    label: '高德卫星图',
    tiles: [
      'https://webst01.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}',
      'https://webst02.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}',
      'https://webst03.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}',
      'https://webst04.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}',
    ],
    attribution: '© 高德地图',
    maxZoom: 18,
    coordSys: 'gcj02',
  },
  carto_dark: {
    id: 'carto_dark',
    label: 'Carto Dark',
    tiles: [
      'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
      'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
      'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
    ],
    attribution: '© <a href="https://carto.com/">CARTO</a>',
    maxZoom: 19,
    coordSys: 'wgs84',
  },
}

export const BASEMAP_LIST = Object.values(BASEMAPS)
