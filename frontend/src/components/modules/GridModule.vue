<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useMap } from '@/composables/useMap'
import { useGridLayer } from '@/composables/useGridLayer'
import { useTimeStore } from '@/stores/time'
import { useVarStore } from '@/stores/var'
import { useMetaStore } from '@/stores/meta'
import HoverTooltip from '@/components/map/HoverTooltip.vue'
import PinTip from '@/components/map/PinTip.vue'
import type { LngLat } from 'maplibre-gl'

const { map }   = useMap()
const timeStore = useTimeStore()
const varStore  = useVarStore()
const metaStore = useMetaStore()

// Activate grid rendering
useGridLayer()

// ── Hover state ───────────────────────────────────────────────────────────────

const hover = ref<{ x: number; y: number; value: number | null } | null>(null)

// ── Picked point state ────────────────────────────────────────────────────────

interface Picked { lat: number; lon: number; x: number; y: number }
const picked = ref<Picked | null>(null)
const pickedValue = ref<number | null>(null)
const showHistory = ref(false)

// ── Interpolation helpers ─────────────────────────────────────────────────────

function bilinear(lat: number, lon: number): number | null {
  const grid = metaStore.grid
  if (!grid) return null

  const lats = grid.lat
  const lons = grid.lon

  // Find surrounding indices
  const latI = lats.findIndex(l => l <= lat)
  const lonI = lons.findIndex(l => l >= lon)
  if (latI <= 0 || lonI <= 0) return null

  const y0 = latI - 1, y1 = latI
  const x0 = lonI - 1, x1 = lonI
  const ty = (lat - lats[y0]!) / (lats[y1]! - lats[y0]!)
  const tx = (lon - lons[x0]!) / (lons[x1]! - lons[x0]!)

  const idx = timeStore.currentIndex
  const varName = varStore.selVar

  // Get current frame from JSON cache (exposed via metaStore or direct import)
  // For now use metaStore's access if available; else null
  // (frame data lives in useGridLayer's jsonCache, not easily accessible here)
  // Real interpolation is done in the Worker; for hover display we do a quick approximation
  void idx; void varName  // suppress unused warnings for now
  void ty; void tx; void x0; void x1; void y0; void y1

  return null  // TODO: expose jsonCache from useGridLayer for hover interpolation
}

// ── Map event handlers ────────────────────────────────────────────────────────

function onMouseMove(e: MouseEvent) {
  hover.value = { x: e.clientX, y: e.clientY, value: null }
  // Update picked point screen position if exists
  if (picked.value) {
    const m = map.value
    if (m) {
      const pt = m.project([picked.value.lon, picked.value.lat] as [number, number])
      picked.value = { ...picked.value, x: pt.x, y: pt.y }
    }
  }
}

function onMouseLeave() {
  hover.value = null
}

function onMapClick(e: { lngLat: LngLat; point: { x: number; y: number } }) {
  picked.value = {
    lat: e.lngLat.lat,
    lon: e.lngLat.lng,
    x: e.point.x,
    y: e.point.y,
  }
  pickedValue.value = bilinear(e.lngLat.lat, e.lngLat.lng)
}

function clearPick() {
  picked.value = null
  pickedValue.value = null
  showHistory.value = false
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') clearPick()
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

onMounted(() => {
  const m = map.value
  if (!m) return
  mapContainer = m.getContainer()
  mapContainer.addEventListener('mousemove', onMouseMove)
  mapContainer.addEventListener('mouseleave', onMouseLeave)
  m.on('click', onMapClick)
  window.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  const m = map.value
  if (mapContainer) {
    mapContainer.removeEventListener('mousemove', onMouseMove)
    mapContainer.removeEventListener('mouseleave', onMouseLeave)
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
    @history="showHistory = true"
  />

  <!-- F-13: HistoryModal placeholder -->
  <div v-if="showHistory" class="history-backdrop" @click="showHistory = false">
    <div class="history-stub" @click.stop>
      <p style="color: var(--fg-1); font-family: var(--font-mono);">历史数据图表（F-13，待实现）</p>
      <button style="color: var(--accent); background: none; border: none; cursor: pointer;" @click="showHistory = false">关闭</button>
    </div>
  </div>
</template>

<style scoped>
.history-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(7,9,12,0.6);
  z-index: 1200;
  display: flex;
  align-items: center;
  justify-content: center;
}
.history-stub {
  background: var(--bg-1);
  border: 1px solid var(--line-3);
  padding: 40px 60px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}
</style>
