<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useRegionLayer } from '@/composables/useRegionLayer'
import { useGridLayer } from '@/composables/useGridLayer'
import { useRegionStore } from '@/stores/region'
import { useTimeStore } from '@/stores/time'
import { useVarStore } from '@/stores/var'
import { VARS } from '@/config/vars'
import Inspector from '@/components/panels/Inspector.vue'

// Activate layers
useRegionLayer()
useGridLayer()

const regionStore = useRegionStore()
const timeStore   = useTimeStore()
const varStore    = useVarStore()

const showHistory = ref(false)

// ── Load stats on mount and when region/mode/var changes ──────────────────────

async function maybeLoad() {
  await regionStore.loadRegions()
  await regionStore.loadStats(regionStore.selRegionId, timeStore.mode)
}

onMounted(maybeLoad)

watch([
  () => regionStore.selRegionId,
  () => timeStore.mode,
], maybeLoad)

// ── Current value ──────────────────────────────────────────────────────────

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
  <!-- Right-side Inspector -->
  <div class="region-right-stack">
    <Inspector
      v-if="regionStore.selRegion"
      mode="region"
      :region-name="regionStore.selRegion.name"
      :frame-label="frameLabel"
      :var-name="varStore.selVar"
      :value="currentValue"
      :unit="VARS[varStore.selVar].units"
      @clear="regionStore.selectRegion('xizang')"
      @history="showHistory = true"
    />
  </div>

  <!-- F-16: HistoryModal placeholder -->
  <div v-if="showHistory" class="history-backdrop" @click="showHistory = false">
    <div class="history-stub" @click.stop>
      <p style="color: var(--fg-1); font-family: var(--font-mono);">区域统计历史图表（F-16，待实现）</p>
      <button style="color: var(--accent); background: none; border: none; cursor: pointer;" @click="showHistory = false">关闭</button>
    </div>
  </div>
</template>

<style scoped>
.region-right-stack {
  position: fixed;
  right: 12px;
  top: calc(var(--h-nav) + var(--h-sub) + 12px);
  z-index: 600;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

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
