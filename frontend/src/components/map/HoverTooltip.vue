<script setup lang="ts">
defineProps<{
  x: number
  y: number
  value: number | null
  unit: string
}>()
</script>

<template>
  <div
    class="hover-tooltip"
    :style="{ left: `${x + 14}px`, top: `${y - 8}px` }"
  >
    <span v-if="value !== null" class="val">{{ value.toPrecision(4) }}</span>
    <span v-else class="nd">N/D</span>
    <span class="unit">{{ unit }}</span>
  </div>
</template>

<style scoped>
.hover-tooltip {
  position: fixed;
  pointer-events: none;
  z-index: 500;
  background: rgba(13, 17, 23, 0.88);
  border: 1px solid var(--line-3);
  padding: 3px 7px;
  font-family: var(--font-mono);
  font-size: 11px;
  display: flex;
  gap: 4px;
  align-items: baseline;
  white-space: nowrap;
}
.val  { color: var(--accent); }
.nd   { color: var(--fg-3); }
.unit { color: var(--fg-3); font-size: 9px; }
</style>
