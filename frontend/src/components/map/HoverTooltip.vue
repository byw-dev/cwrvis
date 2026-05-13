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
</script>

<template>
  <div class="hover-tip" :style="{ left: `${x + 14}px`, top: `${y - 8}px` }">
    <div class="ht-header">
      <span class="coord">{{ lat.toFixed(1) }}°N&nbsp;{{ lon.toFixed(1) }}°E</span>
    </div>
    <div class="ht-meta">
      <span class="ht-label">{{ frameLabel }}</span>
      <span class="ht-label">{{ varName }}</span>
    </div>
    <div class="ht-value">
      <span v-if="value !== null" class="val">{{ value.toPrecision(4) }}</span>
      <span v-else class="nd">N/D</span>
      <span class="unit">{{ unit }}</span>
    </div>
  </div>
</template>

<style scoped>
.hover-tip {
  position: fixed;
  pointer-events: none;
  z-index: 500;
  background: var(--bg-1);
  border: 1px solid var(--line-3);
  width: 190px;
  font-family: var(--font-ui);
  box-shadow: 0 4px 12px rgba(0,0,0,0.4);
}

.ht-header {
  background: var(--bg-2);
  border-bottom: 1px solid var(--line-1);
  padding: 4px 8px;
}
.coord {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--fg-2);
}

.ht-meta {
  display: flex;
  justify-content: space-between;
  padding: 3px 8px;
  border-bottom: 1px solid var(--line-1);
}
.ht-label {
  font-size: 10px;
  color: var(--fg-3);
  font-family: var(--font-mono);
}

.ht-value {
  padding: 5px 8px;
  display: flex;
  align-items: baseline;
  gap: 4px;
}
.val  { font-family: var(--font-mono); font-size: 16px; color: var(--accent); font-weight: 600; }
.nd   { font-family: var(--font-mono); font-size: 13px; color: var(--fg-3); }
.unit { font-family: var(--font-mono); font-size: 10px; color: var(--fg-3); }
</style>
