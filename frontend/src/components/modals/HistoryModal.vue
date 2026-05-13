<script setup lang="ts">
import { ref, computed, watch, onMounted, shallowRef } from 'vue'
import * as echarts from 'echarts/core'
import { LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, MarkLineComponent, LegendComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { useTimeStore } from '@/stores/time'
import { useVarStore } from '@/stores/var'
import { VARS } from '@/config/vars'
import { buildItems } from '@/stores/time'
import type { AggMode, VarName } from '@/types'

echarts.use([LineChart, GridComponent, TooltipComponent, MarkLineComponent, LegendComponent, CanvasRenderer])

// ── Props ─────────────────────────────────────────────────────────────────────

const props = defineProps<{
  // Grid mode: provide lat/lon + gridData
  mode: 'grid' | 'region'
  // Grid mode props
  lat?: number
  lon?: number
  varName?: VarName
  // The full JSON frames data per gran (provided by GridModule)
  gridData?: Record<string, (number | null)[][][]>
}>()

const emit = defineEmits<{ close: [] }>()

// ── State ─────────────────────────────────────────────────────────────────────

const timeStore  = useTimeStore()
const varStore   = useVarStore()

type TabKey = 'monthly' | 'yearly' | 'avg_monthly' | 'avg_season'
const TABS: { key: TabKey; label: string; frames: number }[] = [
  { key: 'monthly',     label: '逐月',   frames: 312 },
  { key: 'yearly',      label: '逐年',   frames: 26  },
  { key: 'avg_monthly', label: '月平均', frames: 12  },
  { key: 'avg_season',  label: '季平均', frames: 4   },
]

const activeTab = ref<TabKey>('monthly')
const chartEl   = ref<HTMLDivElement>()
const chart     = shallowRef<echarts.ECharts | null>(null)

// ── Bilinear interpolation ────────────────────────────────────────────────────

function bilinear(frame2d: (number | null)[][], lat: number, lon: number): number | null {
  // Grid: lat 39.5→25.5 (step -1), lon 75.5→99.5 (step +1)
  const latStart = 39.5, latStep = -1
  const lonStart = 75.5, lonStep =  1

  const gy = (lat - latStart) / latStep
  const gx = (lon - lonStart) / lonStep

  const gy0 = Math.floor(gy), gy1 = Math.min(gy0 + 1, frame2d.length - 1)
  const gx0 = Math.floor(gx), gx1 = Math.min(gx0 + 1, (frame2d[0]?.length ?? 1) - 1)
  if (gy0 < 0 || gx0 < 0) return null

  const ty = gy - gy0, tx = gx - gx0
  let wSum = 0, vSum = 0
  const corners = [[gy0,gx0,(1-tx)*(1-ty)],[gy0,gx1,tx*(1-ty)],[gy1,gx0,(1-tx)*ty],[gy1,gx1,tx*ty]] as const
  for (const [yi, xi, w] of corners) {
    const v = frame2d[yi]?.[xi]
    if (v !== null && v !== undefined) { vSum += v * w; wSum += w }
  }
  return wSum > 0 ? vSum / wSum : null
}

// ── Series data ───────────────────────────────────────────────────────────────

const GRAN_PATH: Record<TabKey, AggMode> = {
  monthly: 'monthly', yearly: 'yearly', avg_monthly: 'avg_monthly', avg_season: 'avg_season',
}

function seriesData(tab: TabKey): { labels: string[]; values: (number | null)[] } {
  if (props.mode !== 'grid' || !props.lat || !props.lon || !props.gridData) {
    return { labels: [], values: [] }
  }

  const granPath: Record<TabKey, string> = {
    monthly: 'month', yearly: 'year', avg_monthly: 'mean_month', avg_season: 'mean_season',
  }
  const frames = props.gridData[granPath[tab]]
  if (!frames) return { labels: [], values: [] }

  const items = buildItems(GRAN_PATH[tab])
  const values = frames.map(f => bilinear(f, props.lat!, props.lon!))
  const labels = items.map(it =>
    it.year && it.month ? `${it.year}-${String(it.month).padStart(2,'0')}`
    : it.year ? String(it.year)
    : it.month ? `${String(it.month).padStart(2,'0')}月`
    : it.season ?? it.label
  )
  return { labels, values }
}

const currentMarkLine = computed(() => {
  const tab = activeTab.value
  const mode = GRAN_PATH[tab] as AggMode
  const items = buildItems(mode)
  const idx = items.findIndex(it => {
    const s = timeStore.sel
    if (tab === 'monthly')     return it.year === s.year && it.month === s.month
    if (tab === 'yearly')      return it.year === s.year
    if (tab === 'avg_monthly') return it.month === s.month
    if (tab === 'avg_season')  return it.season === s.season
    return false
  })
  return idx >= 0 ? idx : null
})

// ── Chart ─────────────────────────────────────────────────────────────────────

function buildOption() {
  const { labels, values } = seriesData(activeTab.value)
  const meta = VARS[props.varName ?? varStore.selVar]

  const markLine = currentMarkLine.value !== null ? {
    silent: true,
    symbol: 'none',
    lineStyle: { color: '#ffba49', width: 1.5, type: 'solid' },
    data: [{ xAxis: currentMarkLine.value }],
  } : undefined

  return {
    backgroundColor: 'transparent',
    grid: { top: 28, right: 20, bottom: 48, left: 60, containLabel: false },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(13,17,23,0.9)',
      borderColor: '#2a3645',
      textStyle: { color: '#b6c2d2', fontSize: 11, fontFamily: 'JetBrains Mono, monospace' },
      formatter: (params: any[]) => {
        const p = params[0]; if (!p) return ''
        return `${p.name}<br/>${p.value !== null ? Number(p.value).toPrecision(4) : 'N/D'} ${meta.units}`
      },
    },
    xAxis: {
      type: 'category',
      data: labels,
      axisLine: { lineStyle: { color: '#1f2a37' } },
      axisTick: { show: false },
      axisLabel: {
        color: '#54606f', fontSize: 9,
        interval: Math.floor(labels.length / 12),
        fontFamily: 'JetBrains Mono, monospace',
      },
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false },
      splitLine: { lineStyle: { color: '#1f2a37' } },
      axisLabel: { color: '#54606f', fontSize: 9, fontFamily: 'JetBrains Mono, monospace' },
    },
    series: [{
      type: 'line',
      data: values,
      lineStyle: { color: '#58e0ff', width: 1.5 },
      itemStyle: { color: '#58e0ff' },
      symbol: 'none',
      markLine,
    }],
  }
}

function updateChart() {
  if (!chart.value) return
  chart.value.setOption(buildOption(), true)
}

onMounted(() => {
  if (chartEl.value) {
    chart.value = echarts.init(chartEl.value, null, { renderer: 'canvas' })
    chart.value.on('click', (params: any) => {
      // Jump to the clicked frame
      const items = buildItems(GRAN_PATH[activeTab.value] as AggMode)
      const it = items[params.dataIndex]
      if (it) { timeStore.goToIndex(params.dataIndex); emit('close') }
    })
    updateChart()
  }
})

watch(activeTab, updateChart)
watch(() => timeStore.currentIndex, updateChart)
</script>

<template>
  <div class="modal-backdrop" @click.self="emit('close')">
    <div class="modal-box">
      <div class="modal-head">
        <span class="modal-title">历史数据 · {{ VARS[props.varName ?? varStore.selVar].long_name }}</span>
        <button class="modal-close" @click="emit('close')">✕</button>
      </div>

      <div class="modal-tabs">
        <button
          v-for="t in TABS" :key="t.key"
          class="tab-btn"
          :class="{ active: activeTab === t.key }"
          @click="activeTab = t.key"
        >{{ t.label }}<span class="tab-frames">{{ t.frames }}帧</span></button>
      </div>

      <div ref="chartEl" class="chart-area" />
    </div>
  </div>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(7,9,12,0.7);
  backdrop-filter: blur(3px);
  z-index: 1200;
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-box {
  background: var(--bg-1);
  border: 1px solid var(--line-3);
  width: 880px;
  max-width: calc(100vw - 32px);
  display: flex;
  flex-direction: column;
}

.modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  border-bottom: 1px solid var(--line-1);
  background: var(--bg-2);
}

.modal-title {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--fg-1);
  letter-spacing: 0.04em;
}

.modal-close {
  background: none;
  border: none;
  color: var(--fg-3);
  cursor: pointer;
  font-size: 12px;
  padding: 2px 6px;
}
.modal-close:hover { color: var(--fg-0); }

.modal-tabs {
  display: flex;
  border-bottom: 1px solid var(--line-1);
}

.tab-btn {
  height: 36px;
  padding: 0 16px;
  background: none;
  border: none;
  border-right: 1px solid var(--line-1);
  color: var(--fg-3);
  font-size: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
}
.tab-btn:hover { background: var(--bg-3); color: var(--fg-1); }
.tab-btn.active { color: var(--accent); background: var(--accent-faint); }

.tab-frames {
  font-size: 9px;
  color: var(--fg-3);
  font-family: var(--font-mono);
}

.chart-area {
  width: 100%;
  height: 420px;
}
</style>
