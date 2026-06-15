<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useRegionLayer, hoverInfo } from '@/composables/useRegionLayer'
import { useGridLayer, isKgToMm } from '@/composables/useGridLayer'
import { useRegionStore } from '@/stores/region'
import { useTimeStore } from '@/stores/time'
import { useVarStore } from '@/stores/var'
import { VARS } from '@/config/vars'
import Inspector from '@/components/panels/Inspector.vue'
import Legend from '@/components/panels/Legend.vue'
import RegionHistoryModal from '@/components/modals/RegionHistoryModal.vue'

// Activate layers
useRegionLayer()
useGridLayer()

const regionStore = useRegionStore()
const timeStore   = useTimeStore()
const varStore    = useVarStore()

const showHistory = ref(false)

// ── Load stats ────────────────────────────────────────────────────────────────

async function maybeLoad() {
  await regionStore.loadRegions()
  await regionStore.loadStats(regionStore.selRegionId, timeStore.mode)
}

onMounted(maybeLoad)
watch([() => regionStore.selRegionId, () => timeStore.mode], maybeLoad)

// ── Current value（含 kg→mm 换算）────────────────────────────────────────────

const area_m2 = computed<number | null>(() =>
  regionStore.selRegion?.area_m2 ?? null
)

const currentValue = computed(() => {
  const raw = regionStore.getValueAtIndex(
    regionStore.selRegionId,
    timeStore.mode,
    timeStore.currentIndex,
    varStore.selVar,
  )
  if (raw === null) return null
  if (isKgToMm.value && VARS[varStore.selVar]?.units === 'kg' && area_m2.value) {
    return raw / area_m2.value
  }
  return raw
})

const currentUnit = computed(() => {
  const base = VARS[varStore.selVar]?.units ?? ''
  return isKgToMm.value && base === 'kg' && area_m2.value ? 'mm' : base
})

const frameLabel = computed(() => {
  const s = timeStore.sel
  switch (timeStore.mode) {
    case 'monthly':     return `${s.year}-${String(s.month).padStart(2,'0')}`
    case 'yearly':      return String(s.year)
    case 'avg_yearly':  return '全期均值'
    case 'avg_monthly': return `${String(s.month).padStart(2,'0')}月均`
    case 'avg_season':  return { spring:'春均', summer:'夏均', autumn:'秋均', winter:'冬均' }[s.season]
  }
})
</script>

<template>
  <!-- Region hover tooltip -->
  <div
    v-if="hoverInfo"
    class="region-hover-tip"
    :style="{ left: hoverInfo.x + 14 + 'px', top: hoverInfo.y - 8 + 'px' }"
  >
    {{ hoverInfo.name }}
  </div>

  <!-- 右侧面板：Inspector（有选中区域时）+ Legend -->
  <div class="right-panel">
    <Inspector
      v-if="regionStore.selRegion"
      mode="region"
      :show-history="true"
      :region-name="regionStore.selRegion.name"
      :frame-label="frameLabel"
      :var-name="VARS[varStore.selVar].display_name"
      :value="currentValue"
      :unit="currentUnit"
      @clear="regionStore.selectRegion('xizang')"
      @history="showHistory = true"
    />
    <Legend />
  </div>

  <RegionHistoryModal
    v-if="showHistory"
    @close="showHistory = false"
  />
</template>

<style scoped>
.region-hover-tip {
  position: fixed;
  pointer-events: none;
  z-index: 500;
  background: var(--bg-1);
  border: 1px solid var(--line-3);
  padding: 4px 10px;
  font-family: var(--font-mono);
  font-size: 0.6875rem;
  color: var(--fg-1);
  white-space: nowrap;
  box-shadow: 0 2px 8px rgba(0,0,0,0.4);
}

.right-panel {
  position: fixed;
  right: 0.75rem;
  bottom: calc(var(--h-bottom) + 0.75rem);
  z-index: 100;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  pointer-events: auto;
}
</style>
