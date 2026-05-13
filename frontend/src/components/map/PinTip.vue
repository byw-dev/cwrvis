<script setup lang="ts">
defineProps<{
  x: number
  y: number
  lat: number
  lon: number
  value: number | null
  unit: string
  frameLabel: string
  varName: string
}>()

const emit = defineEmits<{
  clear: []
  history: []
}>()
</script>

<template>
  <div class="pin-tip" :style="{ left: `${x + 10}px`, top: `${y - 60}px` }">
    <div class="pin-row pin-header">
      <span class="coord">{{ lat.toFixed(1) }}°N&nbsp;{{ lon.toFixed(1) }}°E</span>
      <button class="pin-close" @click="emit('clear')">✕</button>
    </div>
    <div class="pin-row">
      <span class="pin-label">{{ frameLabel }}</span>
      <span class="pin-label">{{ varName }}</span>
    </div>
    <div class="pin-value">
      <span v-if="value !== null" class="val">{{ value.toPrecision(4) }}</span>
      <span v-else class="nd">N/D</span>
      <span class="unit">{{ unit }}</span>
    </div>
    <div class="pin-actions">
      <button class="pin-action" @click="emit('history')">查看历史 ↗</button>
    </div>
  </div>
</template>

<style scoped>
.pin-tip {
  position: fixed;
  z-index: 500;
  background: var(--bg-1);
  border: 1px solid var(--line-3);
  width: 190px;
  font-family: var(--font-ui);
  box-shadow: 0 4px 12px rgba(0,0,0,0.4);
}

.pin-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 8px;
  gap: 4px;
}

.pin-header {
  background: var(--bg-2);
  border-bottom: 1px solid var(--line-1);
}

.coord {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--fg-2);
}

.pin-close {
  background: none;
  border: none;
  color: var(--fg-3);
  font-size: 10px;
  padding: 0;
  cursor: pointer;
  line-height: 1;
}
.pin-close:hover { color: var(--fg-0); }

.pin-label {
  font-size: 10px;
  color: var(--fg-3);
  font-family: var(--font-mono);
}

.pin-value {
  padding: 6px 8px 4px;
  display: flex;
  align-items: baseline;
  gap: 4px;
}
.val  { font-family: var(--font-mono); font-size: 18px; color: var(--accent); font-weight: 600; }
.nd   { font-family: var(--font-mono); font-size: 14px; color: var(--fg-3); }
.unit { font-family: var(--font-mono); font-size: 10px; color: var(--fg-3); }

.pin-actions {
  border-top: 1px solid var(--line-1);
  padding: 4px 8px;
}

.pin-action {
  background: none;
  border: none;
  color: var(--accent);
  font-size: 11px;
  padding: 0;
  cursor: pointer;
}
.pin-action:hover { text-decoration: underline; }
</style>
