<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useRegionLayer, hoverInfo } from '@/composables/useRegionLayer'
import { useGridLayer } from '@/composables/useGridLayer'
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

// ── Current value ─────────────────────────────────────────────────────────────

const currentValue = computed(() =>
  regionStore.getValueAtIndex(
    regionStore.selRegionId,
    timeStore.mode,
    timeStore.currentIndex,
    varStore.selVar,
  )
)

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
      :var-name="varStore.selVar"
      :value="currentValue"
      :unit="VARS[varStore.selVar].units"
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
  font-size: 11px;
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
