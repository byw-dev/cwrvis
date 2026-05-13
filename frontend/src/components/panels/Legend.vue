<script setup lang="ts">
import { ref, watch, onMounted, computed } from 'vue'
import { useVarStore } from '@/stores/var'
import { useSettingsStore } from '@/stores/settings'
import { VARS } from '@/config/vars'
import { getLut } from '@/utils/colormap'
import type { ColormapName } from '@/types'

const varStore = useVarStore()
const settings = useSettingsStore()

const CMAPS: ColormapName[] = ['turbo', 'viridis', 'magma', 'cyan', 'rdbu']

const vm      = computed(() => VARS[varStore.selVar])
const cmName  = computed(() => settings.getColormap(varStore.selVar))
// 优先显示实际渲染量程，若尚未计算则回退配置占位值
const displayVmin = computed(() => varStore.renderRange?.vmin ?? vm.value.vmin)
const displayVmax = computed(() => varStore.renderRange?.vmax ?? vm.value.vmax)
const displayMid  = computed(() => ((displayVmin.value + displayVmax.value) / 2))

// Threshold inputs
const threshMinInput = ref<string>('')
const threshMaxInput = ref<string>('')

watch(() => varStore.selVar, () => {
  threshMinInput.value = ''
  threshMaxInput.value = ''
}, { immediate: true })

function applyThresh() {
  const mn = threshMinInput.value === '' ? null : parseFloat(threshMinInput.value)
  const mx = threshMaxInput.value === '' ? null : parseFloat(threshMaxInput.value)
  varStore.setThresh(
    mn !== null && !isNaN(mn) ? mn : null,
    mx !== null && !isNaN(mx) ? mx : null,
  )
}

function clearThresh() {
  threshMinInput.value = ''
  threshMaxInput.value = ''
  varStore.clearThresh()
}

// Canvas gradient
const canvasRef = ref<HTMLCanvasElement>()

function drawGradient() {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')!
  const lut = getLut(cmName.value)
  const W = canvas.width

  for (let x = 0; x < W; x++) {
    const i = Math.round((x / (W - 1)) * 255) * 4
    ctx.fillStyle = `rgba(${lut[i]},${lut[i+1]},${lut[i+2]},${lut[i+3]/255})`
    ctx.fillRect(x, 0, 1, canvas.height)
  }
}

function drawSwatchOn(canvas: HTMLCanvasElement | null, cm: ColormapName) {
  if (!canvas) return
  const ctx = canvas.getContext('2d')!
  const lut = getLut(cm)
  const W = canvas.width
  for (let x = 0; x < W; x++) {
    const i = Math.round((x / (W - 1)) * 255) * 4
    ctx.fillStyle = `rgba(${lut[i]},${lut[i+1]},${lut[i+2]},${lut[i+3]!/255})`
    ctx.fillRect(x, 0, 1, canvas.height)
  }
}

onMounted(drawGradient)
watch([cmName, () => varStore.selVar], drawGradient)
</script>

<template>
  <div class="legend-panel">
    <!-- Var info -->
    <div class="legend-header">
      <span class="var-code">{{ vm.name }}</span>
      <span class="var-name">{{ vm.long_name }}</span>
    </div>
    <div class="legend-unit">[{{ vm.units }}] · 双线性插值</div>

    <!-- Color ramp -->
    <div class="ramp-wrap">
      <canvas ref="canvasRef" class="ramp-canvas" width="220" height="12" />
      <div class="ramp-ticks">
        <span>{{ displayVmin.toPrecision(3) }}</span>
        <span>{{ displayMid.toPrecision(3) }}</span>
        <span>{{ displayVmax.toPrecision(3) }}</span>
      </div>
    </div>

    <!-- Colormap selector -->
    <div class="cm-selector">
      <button
        v-for="cm in CMAPS" :key="cm"
        class="cm-swatch"
        :class="{ active: cmName === cm }"
        :title="cm"
        @click="settings.setColormap(varStore.selVar, cm)"
      >
        <canvas :ref="el => drawSwatchOn(el as HTMLCanvasElement, cm)" width="24" height="10" />
      </button>
    </div>

    <!-- Threshold -->
    <div class="thresh-row">
      <input
        v-model="threshMinInput"
        class="thresh-input"
        placeholder="最小值"
        type="number"
        @change="applyThresh"
      />
      <span class="thresh-sep">–</span>
      <input
        v-model="threshMaxInput"
        class="thresh-input"
        placeholder="最大值"
        type="number"
        @change="applyThresh"
      />
      <button
        v-if="varStore.threshMin !== null || varStore.threshMax !== null"
        class="thresh-clear"
        @click="clearThresh"
      >✕</button>
    </div>
  </div>
</template>


<style scoped>
.legend-panel {
  background: var(--bg-1);
  border: 1px solid var(--line-2);
  padding: 10px 12px;
  width: 248px;
}

.legend-header {
  display: flex;
  gap: 6px;
  align-items: baseline;
  margin-bottom: 2px;
}
.var-code { font-family: var(--font-mono); font-size: 11px; color: var(--accent); }
.var-name { font-size: 12px; color: var(--fg-1); }
.legend-unit { font-size: 10px; color: var(--fg-3); margin-bottom: 8px; font-family: var(--font-mono); }

.ramp-wrap { margin-bottom: 4px; }
.ramp-canvas { width: 100%; height: 12px; display: block; }
.ramp-ticks {
  display: flex;
  justify-content: space-between;
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--fg-3);
  margin-top: 2px;
}

.cm-selector { display: flex; gap: 3px; margin-bottom: 8px; }
.cm-swatch {
  padding: 0;
  background: none;
  border: 2px solid transparent;
  cursor: pointer;
  line-height: 0;
}
.cm-swatch.active { border-color: var(--accent); }

.thresh-row {
  display: flex;
  align-items: center;
  gap: 4px;
}
.thresh-input {
  flex: 1;
  background: var(--bg-2);
  border: 1px solid var(--line-2);
  color: var(--fg-0);
  font-family: var(--font-mono);
  font-size: 11px;
  padding: 3px 6px;
  width: 0;
  outline: none;
}
.thresh-input:focus { border-color: var(--accent-dim); }
.thresh-sep { font-size: 11px; color: var(--fg-3); }
.thresh-clear {
  background: none;
  border: none;
  color: var(--fg-3);
  cursor: pointer;
  font-size: 11px;
  padding: 2px 4px;
}
.thresh-clear:hover { color: var(--fg-0); }
</style>
