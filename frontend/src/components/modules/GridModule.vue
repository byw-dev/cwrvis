<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import { useMap } from '@/composables/useMap'
import { useGridLayer } from '@/composables/useGridLayer'
import { useTimeStore } from '@/stores/time'
import { useVarStore } from '@/stores/var'
import HoverTooltip from '@/components/map/HoverTooltip.vue'
import Legend from '@/components/panels/Legend.vue'
import Inspector from '@/components/panels/Inspector.vue'
import HistoryModal from '@/components/modals/HistoryModal.vue'
import { isInGridBounds } from '@/utils/grid'
import type { LngLat } from 'maplibre-gl'
import type { AggMode, VarName } from '@/types'

const { map }                               = useMap()
const { getValueAt, fetchFrames, renderTick } = useGridLayer()
const timeStore = useTimeStore()
const varStore  = useVarStore()

// ── Frame label ───────────────────────────────────────────────────────────────

const frameLabel = computed(() => {
  const sel = timeStore.sel
  switch (timeStore.mode) {
    case 'monthly':     return `${sel.year}-${String(sel.month).padStart(2, '0')}`
    case 'yearly':      return String(sel.year)
    case 'avg_yearly':  return '全期均值'
    case 'avg_monthly': return `${String(sel.month).padStart(2, '0')}月均`
    case 'avg_season':  return { spring: '春均', summer: '夏均', autumn: '秋均', winter: '冬均' }[sel.season]
  }
})

// ── Hover state（附带 lngLat 以便时间帧变化时重算值）────────────────────────

interface HoverState { x: number; y: number; lat: number; lng: number; value: number | null }
const hover = ref<HoverState | null>(null)

// ── Picked point state ────────────────────────────────────────────────────────

interface Picked { lat: number; lon: number; x: number; y: number }
const picked      = ref<Picked | null>(null)
const pickedValue = ref<number | null>(null)
const showHistory = ref(false)
const gridData    = ref<Record<string, (number | null)[][][]>>({})

// 每次帧渲染完毕（jsonCache 已更新）或时间帧切换后，重算 hover 和 pick 的值
// 用 renderTick 而非 varStore.selVar，避免在新 var 数据加载前就读到 null
watch(
  [renderTick, () => timeStore.currentIndex, () => timeStore.mode],
  () => {
    if (hover.value) {
      hover.value = { ...hover.value, value: getValueAt(hover.value.lat, hover.value.lng) }
    }
    if (picked.value) {
      pickedValue.value = getValueAt(picked.value.lat, picked.value.lon)
    }
  },
)

// ── Map event handlers ────────────────────────────────────────────────────────

function getLngLat(clientX: number, clientY: number) {
  const m = map.value
  if (!m) return null
  const rect = m.getContainer().getBoundingClientRect()
  return m.unproject([clientX - rect.left, clientY - rect.top])
}

function onMouseMove(e: MouseEvent) {
  const lngLat = getLngLat(e.clientX, e.clientY)
  if (!lngLat || !isInGridBounds(lngLat.lat, lngLat.lng)) {
    hover.value = null
    return
  }
  hover.value = { x: e.clientX, y: e.clientY, lat: lngLat.lat, lng: lngLat.lng, value: getValueAt(lngLat.lat, lngLat.lng) }
}

function onMouseLeave() { hover.value = null }

function onMapMove() {
  // 地图平移/缩放后更新圆点的屏幕坐标
  const m = map.value
  if (!m || !picked.value) return
  const pt = m.project([picked.value.lon, picked.value.lat] as [number, number])
  picked.value = { ...picked.value, x: pt.x, y: pt.y }
}

function onMapClick(e: { lngLat: LngLat; point: { x: number; y: number } }) {
  if (!isInGridBounds(e.lngLat.lat, e.lngLat.lng)) { clearPick(); return }
  picked.value    = { lat: e.lngLat.lat, lon: e.lngLat.lng, x: e.point.x, y: e.point.y }
  pickedValue.value = getValueAt(e.lngLat.lat, e.lngLat.lng)
}

function clearPick() {
  picked.value = null
  pickedValue.value = null
  showHistory.value = false
}

function onKeydown(e: KeyboardEvent) { if (e.key === 'Escape') clearPick() }

// ── History modal ─────────────────────────────────────────────────────────────

const HISTORY_MODES: AggMode[] = ['monthly', 'yearly', 'avg_monthly', 'avg_season']
const GRAN_PATH_MAP: Partial<Record<AggMode, string>> = {
  monthly: 'month', yearly: 'year', avg_monthly: 'mean_month', avg_season: 'mean_season',
}

async function openHistory() {
  showHistory.value = true
  const varName = varStore.selVar as VarName
  const results = await Promise.all(HISTORY_MODES.map(m => fetchFrames(varName, m)))
  const data: Record<string, (number | null)[][][]> = {}
  HISTORY_MODES.forEach((m, i) => { if (results[i]) data[GRAN_PATH_MAP[m]!] = results[i]! })
  gridData.value = data
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

let mapContainer: HTMLElement | null = null

watch(
  () => map.value,
  (m) => {
    if (!m || mapContainer) return
    mapContainer = m.getContainer()
    mapContainer.addEventListener('mousemove', onMouseMove)
    mapContainer.addEventListener('mouseleave', onMouseLeave)
    m.on('click', onMapClick)
    m.on('move',  onMapMove)
    window.addEventListener('keydown', onKeydown)
  },
  { immediate: true },
)

onUnmounted(() => {
  const m = map.value
  if (mapContainer) {
    mapContainer.removeEventListener('mousemove', onMouseMove)
    mapContainer.removeEventListener('mouseleave', onMouseLeave)
    mapContainer = null
  }
  m?.off('click', onMapClick)
  m?.off('move',  onMapMove)
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <!-- Hover tooltip（格点范围内，类 PinTip 样式，无操作按钮）-->
  <HoverTooltip
    v-if="hover"
    :x="hover.x"
    :y="hover.y"
    :lat="hover.lat"
    :lon="hover.lng"
    :value="hover.value"
    :unit="varStore.varMeta.units"
    :frame-label="frameLabel"
    :var-name="varStore.selVar"
  />

  <!-- Click 圆点标记 -->
  <div
    v-if="picked"
    class="pick-dot"
    :style="{ left: picked.x + 'px', top: picked.y + 'px' }"
  />

  <!-- 右侧面板：检查器（有 pick 时）+ 图例 -->
  <div class="right-panel">
    <Inspector
      v-if="picked"
      mode="grid"
      :lat="picked.lat"
      :lon="picked.lon"
      :frame-label="frameLabel"
      :var-name="varStore.selVar"
      :value="pickedValue"
      :unit="varStore.varMeta.units"
      @clear="clearPick"
      @history="openHistory"
    />
    <Legend />
  </div>

  <HistoryModal
    v-if="showHistory"
    mode="grid"
    :lat="picked?.lat"
    :lon="picked?.lon"
    :var-name="varStore.selVar as VarName"
    :grid-data="gridData"
    @close="showHistory = false"
  />
</template>

<style scoped>
.pick-dot {
  position: fixed;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--accent);
  border: 2px solid #fff;
  transform: translate(-50%, -50%);
  pointer-events: none;
  z-index: 200;
  box-shadow: 0 0 0 3px rgba(88, 224, 255, 0.3);
}

.right-panel {
  position: fixed;
  right: 12px;
  bottom: 52px;   /* BottomBar 高度上方 */
  z-index: 100;
  display: flex;
  flex-direction: column;
  gap: 6px;
  pointer-events: auto;
}

</style>
