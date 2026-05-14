<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  mode: 'grid' | 'region'
  lat?: number
  lon?: number
  frameLabel?: string
  varName?: string
  value?: number | null
  unit?: string
  regionName?: string
  showHistory?: boolean  // default true；avg_yearly 无历史数据时传 false
}>()

const emit = defineEmits<{
  clear: []
  history: []
}>()

const hasValue = computed(() => props.value !== undefined && props.value !== null)
const coordLabel = computed(() =>
  props.mode === 'grid'
    ? `${props.lat?.toFixed(1)}°N ${props.lon?.toFixed(1)}°E`
    : (props.regionName ?? '—')
)
</script>

<template>
  <div class="inspector-panel">
    <!-- Header: coord / region -->
    <div class="insp-header">
      <span class="coord">{{ coordLabel }}</span>
    </div>

    <!-- Meta: time + var -->
    <div class="insp-meta">
      <span class="meta-item">{{ frameLabel }}</span>
      <span class="meta-item">{{ varName }}</span>
    </div>

    <!-- Value -->
    <div class="insp-value">
      <span v-if="hasValue" class="big-val">{{ value!.toPrecision(4) }}</span>
      <span v-else class="no-val">N/D</span>
      <span class="big-unit">{{ unit }}</span>
    </div>

    <!-- Actions -->
    <div class="insp-actions">
      <button
        v-if="showHistory !== false"
        class="insp-btn accent"
        @click="emit('history')"
      >查看历史 ↗</button>
      <button class="insp-btn" @click="emit('clear')">清除</button>
    </div>
  </div>
</template>

<style scoped>
.inspector-panel {
  background: var(--bg-1);
  border: 1px solid var(--line-2);
  width: 15.5rem;
  font-family: var(--font-ui);
}

.insp-header {
  background: var(--bg-2);
  border-bottom: 1px solid var(--line-1);
  padding: 0.25em 0.625em;
}
.coord {
  font-family: var(--font-mono);
  font-size: 0.625rem;
  color: var(--fg-2);
}

.insp-meta {
  display: flex;
  justify-content: space-between;
  padding: 0.1875em 0.625em;
  border-bottom: 1px solid var(--line-1);
}
.meta-item {
  font-size: 0.625rem;
  color: var(--fg-3);
  font-family: var(--font-mono);
}

.insp-value {
  padding: 0.5em 0.625em 0.375em;
  display: flex;
  align-items: baseline;
  gap: 0.3125em;
}
.big-val  { font-family: var(--font-mono); font-size: 1.125rem; color: var(--accent); font-weight: 700; }
.no-val   { font-family: var(--font-mono); font-size: 0.875rem; color: var(--fg-3); }
.big-unit { font-family: var(--font-mono); font-size: 0.6875rem; color: var(--fg-3); }

.insp-actions {
  display: flex;
  gap: 0.375em;
  padding: 0.375em 0.625em 0.5em;
  border-top: 1px solid var(--line-1);
}
.insp-btn {
  flex: 1;
  padding: 0.3em 0;
  background: var(--bg-2);
  border: 1px solid var(--line-2);
  color: var(--fg-2);
  font-size: 0.6875rem;
  cursor: pointer;
}
.insp-btn:hover { background: var(--bg-3); color: var(--fg-0); }
.insp-btn.accent { color: var(--accent); }
</style>
