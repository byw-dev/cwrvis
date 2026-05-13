<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import { useMap } from '@/composables/useMap'
import { useGridLayer } from '@/composables/useGridLayer'
import { useTimeStore } from '@/stores/time'
import { useVarStore } from '@/stores/var'
import HoverTooltip from '@/components/map/HoverTooltip.vue'
import PinTip from '@/components/map/PinTip.vue'
import Legend from '@/components/panels/Legend.vue'
import Inspector from '@/components/panels/Inspector.vue'
import HistoryModal from '@/components/modals/HistoryModal.vue'
import { isInGridBounds } from '@/utils/grid'
import type { LngLat } from 'maplibre-gl'
import type { AggMode, VarName } from '@/types'

const { map }                           = useMap()
const { getValueAt, fetchFrames }       = useGridLayer()
const timeStore = useTimeStore()
const varStore  = useVarStore()

// ── Hover state ───────────────────────────────────────────────────────────────

const hover = ref<{ x: number; y: number; value: number | null } | null>(null)

// ── Picked point state ────────────────────────────────────────────────────────

interface Picked { lat: number; lon: number; x: number; y: number }
const picked    = ref<Picked | null>(null)
const pickedValue = ref<number | null>(null)
const showHistory = ref(false)
const gridData  = ref<Record<string, (number | null)[][][]>>({})

// ── Map event handlers ────────────────────────────────────────────────────────

function onMouseMove(e: MouseEvent) {
  const m = map.value
  if (!m) return

  const rect   = m.getContainer().getBoundingClientRect()
  const lngLat = m.unproject([e.clientX - rect.left, e.clientY - rect.top])

  if (!isInGridBounds(lngLat.lat, lngLat.lng)) {
    hover.value = null
    return
  }

  hover.value = { x: e.clientX, y: e.clientY, value: getValueAt(lngLat.lat, lngLat.lng) }

  if (picked.value) {
    const pt = m.project([picked.value.lon, picked.value.lat] as [number, number])
    picked.value = { ...picked.value, x: pt.x, y: pt.y }
  }
}

function onMouseLeave() {
  hover.value = null
}

function onMapClick(e: { lngLat: LngLat; point: { x: number; y: number } }) {
  if (!isInGridBounds(e.lngLat.lat, e.lngLat.lng)) {
    clearPick()
    return
  }
  picked.value = { lat: e.lngLat.lat, lon: e.lngLat.lng, x: e.point.x, y: e.point.y }
  pickedValue.value = getValueAt(e.lngLat.lat, e.lngLat.lng)
}

function clearPick() {
  picked.value = null
  pickedValue.value = null
  showHistory.value = false
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') clearPick()
}

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
  HISTORY_MODES.forEach((m, i) => {
    const frames = results[i]
    if (frames) data[GRAN_PATH_MAP[m]!] = frames
  })
  gridData.value = data
}

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

// ── Lifecycle ─────────────────────────────────────────────────────────────────

let mapContainer: HTMLElement | null = null

// 用 watch 替代 onMounted，消除 map 初始化与组件挂载的竞态
watch(
  () => map.value,
  (m) => {
    if (!m || mapContainer) return  // 已绑定则跳过
    mapContainer = m.getContainer()
    mapContainer.addEventListener('mousemove', onMouseMove)
    mapContainer.addEventListener('mouseleave', onMouseLeave)
    m.on('click', onMapClick)
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
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <HoverTooltip
    v-if="hover"
    :x="hover.x"
    :y="hover.y"
    :value="hover.value"
    :unit="varStore.varMeta.units"
  />

  <PinTip
    v-if="picked"
    :x="picked.x"
    :y="picked.y"
    :lat="picked.lat"
    :lon="picked.lon"
    :value="pickedValue"
    :unit="varStore.varMeta.units"
    :frame-label="frameLabel"
    :var-name="varStore.selVar"
    @clear="clearPick"
    @history="openHistory"
  />

  <!-- 右侧面板：图例 + 检查器 -->
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
