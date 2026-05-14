<script setup lang="ts">
import { ref, computed, watch, onMounted, shallowRef } from 'vue'
import * as echarts from 'echarts/core'
import { LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, MarkLineComponent, LegendComponent, GraphicComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { useTimeStore } from '@/stores/time'
import { useVarStore } from '@/stores/var'
import { useMetaStore } from '@/stores/meta'
import { VARS } from '@/config/vars'
import { buildItems } from '@/stores/time'
import { fetchGridFrames, isKgToMm } from '@/composables/useGridLayer'
import { bilinearInterp } from '@/utils/grid'
import type { AggMode, VarName } from '@/types'

echarts.use([LineChart, GridComponent, TooltipComponent, MarkLineComponent, LegendComponent, GraphicComponent, CanvasRenderer])

// ── Props ─────────────────────────────────────────────────────────────────────

type TabKey = 'monthly' | 'yearly' | 'avg_monthly' | 'avg_season'

const props = defineProps<{
  mode: 'grid' | 'region'
  lat?: number
  lon?: number
  varName?: VarName
  initialTab?: TabKey  // 打开时默认选中的 tab（由父组件按当前聚合模式传入）
}>()

const emit = defineEmits<{ close: [] }>()

// ── State ─────────────────────────────────────────────────────────────────────

const timeStore = useTimeStore()
const varStore  = useVarStore()
const metaStore = useMetaStore()

const effectiveVar = computed(() => VARS[props.varName ?? varStore.selVar])
const isKgVar      = computed(() => effectiveVar.value.units === 'kg')
const effectiveUnit = computed(() =>
  props.mode === 'grid' && isKgVar.value && isKgToMm.value ? 'mm' : effectiveVar.value.units
)

function toggleUnit(): void { isKgToMm.value = !isKgToMm.value }

const TABS: { key: TabKey; label: string; mode: AggMode; frames: number }[] = [
  { key: 'monthly',     label: '逐月',   mode: 'monthly',     frames: 312 },
  { key: 'yearly',      label: '逐年',   mode: 'yearly',      frames: 26  },
  { key: 'avg_monthly', label: '月平均', mode: 'avg_monthly', frames: 12  },
  { key: 'avg_season',  label: '季平均', mode: 'avg_season',  frames: 4   },
]

const activeTab = ref<TabKey>(props.initialTab ?? 'monthly')
const chartEl   = ref<HTMLDivElement>()
const chart     = shallowRef<echarts.ECharts | null>(null)

// 懒加载缓存：key = TabKey，value = 帧数组
const tabData    = ref<Partial<Record<TabKey, (number | null)[][][]>>>({})
const tabLoading = ref<Partial<Record<TabKey, boolean>>>({})

// ── 懒加载：按 tab 按需 fetch ─────────────────────────────────────────────────

async function loadTab(tab: TabKey): Promise<void> {
  if (tabData.value[tab] || tabLoading.value[tab]) return
  if (props.mode !== 'grid' || !props.varName) return

  tabLoading.value = { ...tabLoading.value, [tab]: true }
  const mode = TABS.find(t => t.key === tab)!.mode
  const data = await fetchGridFrames(props.varName, mode)
  if (data) tabData.value = { ...tabData.value, [tab]: data }
  tabLoading.value = { ...tabLoading.value, [tab]: false }
  updateChart()
}

// ── Series data ───────────────────────────────────────────────────────────────

function seriesData(tab: TabKey): { labels: string[]; values: (number | null)[] } {
  if (props.mode !== 'grid' || !props.lat || !props.lon) return { labels: [], values: [] }
  const frames = tabData.value[tab]
  if (!frames) return { labels: [], values: [] }

  const mode  = TABS.find(t => t.key === tab)!.mode
  const items = buildItems(mode)

  // kg→mm：dxy 值对该点插值一次，312 帧共用
  const needConvert = isKgVar.value && isKgToMm.value
  const dxy = needConvert ? (metaStore.grid?.dxy ?? null) : null
  const dxyVal = dxy ? bilinearInterp(dxy as (number | null)[][], props.lat!, props.lon!) : null

  const values = frames.map(f => {
    const v = bilinearInterp(f, props.lat!, props.lon!)
    if (!needConvert || v === null || !dxyVal || dxyVal <= 0) return v
    return v / dxyVal
  })
  const labels = items.map(it =>
    it.year && it.month ? `${it.year}-${String(it.month).padStart(2,'0')}`
    : it.year   ? String(it.year)
    : it.month  ? `${String(it.month).padStart(2,'0')}月`
    : it.season ?? it.label ?? ''
  )
  return { labels, values }
}

const currentMarkLine = computed(() => {
  const tab  = activeTab.value
  const mode = TABS.find(t => t.key === tab)!.mode
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
  const meta  = effectiveVar.value
  const isLoading = tabLoading.value[activeTab.value]

  const markIdx = currentMarkLine.value
  const markLine = markIdx !== null ? {
    silent: true,
    symbol: 'none',
    lineStyle: { color: '#ffba49', width: 1.5, type: 'dashed' },
    label: { formatter: '{b}', color: '#ffba49', fontSize: 9, fontFamily: 'JetBrains Mono, monospace' },
    data: [{ xAxis: markIdx, name: labels[markIdx] ?? String(markIdx) }],
  } : undefined

  return {
    backgroundColor: 'transparent',
    graphic: isLoading ? [{
      type: 'text',
      left: 'center', top: 'middle',
      style: { text: '加载中…', fill: '#54606f', fontSize: 13, fontFamily: 'JetBrains Mono, monospace' },
    }] : [],
    grid: { top: 28, right: 20, bottom: 48, left: 8, containLabel: true },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(13,17,23,0.9)',
      borderColor: '#2a3645',
      textStyle: { color: '#b6c2d2', fontSize: 11, fontFamily: 'JetBrains Mono, monospace' },
      formatter: (params: any[]) => {
        const p = params[0]; if (!p) return ''
        return `${p.name}<br/>${p.value !== null ? Number(p.value).toPrecision(4) : 'N/D'} ${effectiveUnit.value}`
      },
    },
    xAxis: {
      type: 'category', data: labels,
      axisLine: { lineStyle: { color: '#1f2a37' } },
      axisTick: { show: false },
      axisLabel: {
        color: '#54606f', fontSize: 9,
        interval: Math.floor(Math.max(labels.length / 12, 0)),
        fontFamily: 'JetBrains Mono, monospace',
      },
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false },
      splitLine: { lineStyle: { color: '#1f2a37' } },
      axisLabel: {
        color: '#54606f', fontSize: 9, fontFamily: 'JetBrains Mono, monospace',
        formatter: (v: number) => v !== 0 && Math.abs(v) >= 1e6 ? v.toExponential(2) : String(v),
      },
    },
    series: [{
      type: 'line', data: values,
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

onMounted(async () => {
  if (chartEl.value) {
    chart.value = echarts.init(chartEl.value, null, { renderer: 'canvas' })
    chart.value.on('click', (params: any) => {
      timeStore.goToIndex(params.dataIndex)
      emit('close')
    })
  }
  await loadTab(activeTab.value)
})

// tab 切换时懒加载（切换不影响外部 timeStore.mode）
watch(activeTab, async (tab) => {
  updateChart()          // 先刷新（可能显示空/loading）
  await loadTab(tab)    // 异步加载后会再次 updateChart
})

// 外部时间变化时更新 markLine
watch(() => timeStore.currentIndex, updateChart)

// 单位切换时重绘（isKgToMm 为模块级 ref，格点模式 kg var 时有效）
watch(isKgToMm, updateChart)
</script>

<template>
  <div class="modal-backdrop" @click.self="emit('close')">
    <div class="modal-box">
      <div class="modal-head">
        <div class="modal-head-left">
          <span class="modal-title">历史数据 · {{ effectiveVar.long_name }}</span>
          <button
            v-if="mode === 'grid' && isKgVar"
            class="unit-toggle-btn"
            @click="toggleUnit"
          >{{ isKgToMm ? 'mm→kg' : 'kg→mm' }}</button>
        </div>
        <button class="modal-close" @click="emit('close')">✕</button>
      </div>

      <div class="modal-tabs">
        <button
          v-for="t in TABS" :key="t.key"
          class="tab-btn"
          :class="{ active: activeTab === t.key }"
          @click="activeTab = t.key"
        >
          {{ t.label }}
          <span class="tab-frames">{{ t.frames }}帧</span>
          <span v-if="tabLoading[t.key]" class="tab-loading">…</span>
        </button>
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
  width: 55rem;
  max-width: calc(100vw - 2em);
  display: flex;
  flex-direction: column;
}
.modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.625em 1em;
  border-bottom: 1px solid var(--line-1);
  background: var(--bg-2);
}
.modal-head-left { display: flex; align-items: center; gap: 1.25em; }
.modal-title { font-family: var(--font-mono); font-size: 0.75rem; color: var(--fg-1); letter-spacing: 0.04em; }
.unit-toggle-btn {
  background: none;
  border: 1px solid var(--accent-dim);
  color: var(--accent);
  font-family: var(--font-mono);
  font-size: 0.625rem;
  padding: 0.125em 0.5em;
  cursor: pointer;
  letter-spacing: 0.04em;
}
.unit-toggle-btn:hover { background: var(--accent-faint); }
.modal-close { background: none; border: none; color: var(--fg-3); cursor: pointer; font-size: 0.75rem; padding: 0.125em 0.375em; }
.modal-close:hover { color: var(--fg-0); }
.modal-tabs { display: flex; border-bottom: 1px solid var(--line-1); }
.tab-btn {
  padding: 0.625em 1em; background: none; border: none;
  border-right: 1px solid var(--line-1); color: var(--fg-3); font-size: 0.75rem;
  cursor: pointer; display: flex; align-items: center; gap: 0.375em;
}
.tab-btn:hover { background: var(--bg-3); color: var(--fg-1); }
.tab-btn.active { color: var(--accent); background: var(--accent-faint); }
.tab-frames { font-size: 0.5625rem; color: var(--fg-3); font-family: var(--font-mono); }
.tab-loading { font-size: 0.5625rem; color: var(--accent); }
.chart-area { width: 100%; height: 420px; }
</style>
