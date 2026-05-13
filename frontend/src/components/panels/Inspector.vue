<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  mode: 'grid' | 'region'
  // grid mode
  lat?: number
  lon?: number
  frameLabel?: string
  varName?: string
  value?: number | null
  unit?: string
  // region mode
  regionName?: string
}>()

const emit = defineEmits<{
  clear: []
  history: []
}>()

const hasValue = computed(() => props.value !== undefined && props.value !== null)
</script>

<template>
  <div class="inspector-panel">
    <template v-if="mode === 'grid'">
      <div class="insp-row insp-labels">
        <span>COORD</span><span>TIME</span><span>VAR</span>
      </div>
      <div class="insp-row insp-vals">
        <span>{{ lat?.toFixed(1) }}°N {{ lon?.toFixed(1) }}°E</span>
        <span>{{ frameLabel }}</span>
        <span>{{ varName }}</span>
      </div>
      <div class="insp-value">
        <span v-if="hasValue" class="big-val">{{ value!.toPrecision(4) }}</span>
        <span v-else class="no-val">N/D</span>
        <span class="big-unit">{{ unit }}</span>
      </div>
    </template>

    <template v-else>
      <div class="insp-row insp-labels">
        <span>区域</span><span>TIME</span><span>VAR</span>
      </div>
      <div class="insp-row insp-vals">
        <span>{{ regionName }}</span>
        <span>{{ frameLabel }}</span>
        <span>{{ varName }}</span>
      </div>
      <div class="insp-value">
        <span v-if="hasValue" class="big-val">{{ value!.toPrecision(4) }}</span>
        <span v-else class="no-val">—</span>
        <span v-if="hasValue" class="big-unit">{{ unit }}</span>
      </div>
    </template>

    <div class="insp-actions">
      <button class="insp-btn accent" @click="emit('history')">查看历史 ↗</button>
      <button class="insp-btn" @click="emit('clear')">清除</button>
    </div>
  </div>
</template>

<style scoped>
.inspector-panel {
  background: var(--bg-1);
  border: 1px solid var(--line-2);
  width: 248px;
  font-family: var(--font-ui);
}

.insp-row {
  display: flex;
  gap: 0;
  padding: 0;
}

.insp-labels {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  background: var(--bg-2);
  border-bottom: 1px solid var(--line-1);
  padding: 4px 10px;
}
.insp-labels span {
  font-size: 9px;
  color: var(--fg-3);
  letter-spacing: 0.08em;
  font-family: var(--font-mono);
}

.insp-vals {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  padding: 4px 10px;
  border-bottom: 1px solid var(--line-1);
}
.insp-vals span {
  font-size: 10px;
  color: var(--fg-2);
  font-family: var(--font-mono);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.insp-value {
  padding: 10px 10px 8px;
  display: flex;
  align-items: baseline;
  gap: 5px;
}
.big-val  { font-family: var(--font-mono); font-size: 22px; color: var(--accent); font-weight: 700; }
.no-val   { font-family: var(--font-mono); font-size: 16px; color: var(--fg-3); }
.big-unit { font-family: var(--font-mono); font-size: 11px; color: var(--fg-3); }

.insp-actions {
  display: flex;
  gap: 6px;
  padding: 6px 10px 8px;
  border-top: 1px solid var(--line-1);
}
.insp-btn {
  flex: 1;
  height: 24px;
  background: var(--bg-2);
  border: 1px solid var(--line-2);
  color: var(--fg-2);
  font-size: 11px;
  cursor: pointer;
}
.insp-btn:hover { background: var(--bg-3); color: var(--fg-0); }
.insp-btn.accent { color: var(--accent); }
</style>
