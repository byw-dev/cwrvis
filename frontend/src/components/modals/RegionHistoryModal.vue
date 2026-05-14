<script setup lang="ts">
import { ref, computed, watch, onMounted, shallowRef, nextTick } from 'vue'
import * as echarts from 'echarts/core'
import { LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, MarkLineComponent, LegendComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { useRegionStore } from '@/stores/region'
import { useTimeStore } from '@/stores/time'
import { useVarStore } from '@/stores/var'
import { VARS, VAR_GROUPS } from '@/config/vars'
import { buildItems } from '@/stores/time'
import type { VarName, AggMode } from '@/types'

echarts.use([LineChart, GridComponent, TooltipComponent, MarkLineComponent, LegendComponent, CanvasRenderer])

const emit = defineEmits<{ close: [] }>()

const regionStore = useRegionStore()
const timeStore   = useTimeStore()
const varStore    = useVarStore()

type TabKey = 'monthly' | 'yearly' | 'avg_monthly' | 'avg_season'
const TABS: { key: TabKey; label: string; mode: AggMode }[] = [
  { key: 'monthly',     label: '逐月',   mode: 'monthly'     },
  { key: 'yearly',      label: '逐年',   mode: 'yearly'      },
  { key: 'avg_monthly', label: '月平均', mode: 'avg_monthly' },
  { key: 'avg_season',  label: '季平均', mode: 'avg_season'  },
]

const activeTab    = ref<TabKey>('yearly')
const activeVars   = ref<VarName[]>([varStore.selVar])
const varPickerOpen = ref(false)

const chartEl = ref<HTMLDivElement>()
const chart   = shallowRef<echarts.ECharts | null>(null)

const SERIES_COLORS = ['#58e0ff', '#ffba49', '#88e07a', '#ff7c7c', '#b88aff']
const SYMBOLS       = ['circle', 'rect', 'triangle', 'diamond', 'roundRect'] as const
const LINE_TYPES    = ['solid', 'dashed', 'dotted'] as const

// px per right Y-axis: tick labels (non-kg ≤ 4 chars at fontSize 9 ≈ 28px) + axis + padding
const AXIS_W = 58

const rightAxisCount  = ref(0)
const hoveredSeries   = ref<string | null>(null)
// modal width grows with each additional right axis; capped by viewport
const modalWidth = computed(() => Math.min(1280, 800 + rightAxisCount.value * AXIS_W))

// ── Data loading ──────────────────────────────────────────────────────────────

async function ensureData(varName: VarName, mode: AggMode) {
  await regionStore.loadStats(regionStore.selRegionId, mode)
}

async function loadActiveTab() {
  const mode = TABS.find(t => t.key === activeTab.value)!.mode
  for (const vn of activeVars.value) {
    await ensureData(vn, mode)
  }
  updateChart()
}

async function addVar(vn: VarName) {
  if (activeVars.value.includes(vn)) return
  activeVars.value = [...activeVars.value, vn]
  const mode = TABS.find(t => t.key === activeTab.value)!.mode
  await ensureData(vn, mode)
  varPickerOpen.value = false
  updateChart()
}

function removeVar(vn: VarName) {
  if (activeVars.value.length <= 1) return
  activeVars.value = activeVars.value.filter(v => v !== vn)
  updateChart()
}

// ── Chart ─────────────────────────────────────────────────────────────────────

function buildLabels(mode: AggMode): string[] {
  return buildItems(mode).map(it =>
    it.year && it.month ? `${it.year}-${String(it.month).padStart(2,'0')}`
    : it.year  ? String(it.year)
    : it.month ? `${String(it.month).padStart(2,'0')}月`
    : it.season ?? it.label
  )
}

function currentMarkIdx(mode: AggMode): number | null {
  const items = buildItems(mode)
  const s = timeStore.sel
  const idx = items.findIndex(it => {
    if (mode === 'monthly')     return it.year === s.year && it.month === s.month
    if (mode === 'yearly')      return it.year === s.year
    if (mode === 'avg_monthly') return it.month === s.month
    if (mode === 'avg_season')  return it.season === s.season
    return false
  })
  return idx >= 0 ? idx : null
}

function updateChart() {
  if (!chart.value) return
  const tab  = TABS.find(t => t.key === activeTab.value)!
  const mode = tab.mode
  const labels = buildLabels(mode)
  const markIdx = currentMarkIdx(mode)

  // ── Y-axis layout ──────────────────────────────────────────────────────
  // kg 专占左轴；其他单位依次向右平铺，每轴间距 70px
  const hasKg = activeVars.value.some(vn => VARS[vn].units === 'kg')
  const unitsOrdered: string[] = []
  if (hasKg) unitsOrdered.push('kg')
  for (const vn of activeVars.value) {
    const u = VARS[vn].units
    if (!unitsOrdered.includes(u)) unitsOrdered.push(u)
  }

  const unitToAxisIdx = new Map<string, number>()
  unitsOrdered.forEach((u, i) => unitToAxisIdx.set(u, i))

  const fmtLabel = (v: number) =>
    v !== 0 && Math.abs(v) >= 1e6 ? v.toExponential(2) : String(v)

  const rightCount = unitsOrdered.length - 1
  rightAxisCount.value = rightCount
  const gridRight = rightCount === 0 ? 20 : 20 + rightCount * AXIS_W

  const yAxes = unitsOrdered.map((unit, i) => {
    const isLeft = i === 0
    return {
      type: 'value',
      name: unit,
      nameLocation: 'end',   // unit label sits just above the topmost tick
      nameGap: 6,
      nameTextStyle: { color: '#54606f', fontSize: 9, fontFamily: 'JetBrains Mono, monospace' },
      position: isLeft ? 'left' : 'right',
      offset: isLeft ? undefined : (i - 1) * AXIS_W,
      axisLine: { show: false },
      splitLine: isLeft ? { lineStyle: { color: '#1f2a37' } } : { show: false },
      axisLabel: {
        color: '#54606f', fontSize: 9, fontFamily: 'JetBrains Mono, monospace',
        formatter: fmtLabel,
      },
    }
  })

  // ── Series ─────────────────────────────────────────────────────────────
  // monthly has 312 dense points — symbols clutter the line; show them for other modes
  const showSymbol = mode !== 'monthly'

  const series = activeVars.value.map((vn, i) => {
    const color    = SERIES_COLORS[i % SERIES_COLORS.length]
    const symbol   = SYMBOLS[i % SYMBOLS.length]
    const lineType = LINE_TYPES[i % LINE_TYPES.length]
    const rows = regionStore.getCached(regionStore.selRegionId, mode) ?? []
    const data = rows.map(r => {
      const v = r[vn as string]
      return typeof v === 'number' ? v : null
    })
    return {
      type: 'line' as const,
      name: vn,
      data,
      yAxisIndex: unitToAxisIdx.get(VARS[vn].units) ?? 0,
      symbol,
      symbolSize: 5,
      showSymbol,
      lineStyle: { color, width: 1.5, type: lineType },
      itemStyle: { color },
      // hover: highlight this series, fade all others
      emphasis: { focus: 'series', lineStyle: { width: 2.5 } },
      blur:     { lineStyle: { opacity: 0.15 }, itemStyle: { opacity: 0.15 } },
      markLine: markIdx !== null && i === 0 ? {
        silent: true,
        symbol: 'none',
        lineStyle: { color: '#ffba49', width: 1.5 },
        label: { formatter: '{b}', color: '#ffba49', fontSize: 9, fontFamily: 'JetBrains Mono, monospace' },
        data: [{ xAxis: markIdx, name: labels[markIdx] ?? String(markIdx) }],
      } : undefined,
    }
  })

  chart.value.setOption({
    backgroundColor: 'transparent',
    legend: {
      type: 'scroll',
      bottom: 4,
      left: 'center',
      orient: 'horizontal',
      itemWidth: 14,
      itemHeight: 8,
      textStyle: { color: '#b6c2d2', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' },
      inactiveColor: '#3b4a5e',
      pageIconColor: '#58e0ff',
      pageTextStyle: { color: '#54606f', fontSize: 9, fontFamily: 'JetBrains Mono, monospace' },
    },
    grid: { top: 24, right: gridRight, bottom: 60, left: 8, containLabel: true },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(13,17,23,0.9)',
      borderColor: '#2a3645',
      textStyle: { color: '#b6c2d2', fontSize: 11, fontFamily: 'JetBrains Mono, monospace' },
      formatter: (params: any[]) => {
        if (!params.length) return ''
        const active = hoveredSeries.value
        let html = `<div style="margin-bottom:4px;color:#b6c2d2">${params[0].axisValue}</div>`
        for (const p of params) {
          const meta   = VARS[p.seriesName as VarName]
          const val    = p.value
          const valStr = val === null || val === undefined ? 'N/D'
            : Math.abs(Number(val)) >= 1e6 ? Number(val).toExponential(3)
            : Number(val).toPrecision(4)
          const isActive = !active || p.seriesName === active
          const fg     = isActive ? '#e8f4ff' : '#3a4d62'
          const weight = isActive ? '600' : '400'
          html += `<div style="color:${fg};font-weight:${weight};line-height:1.6">` +
            `<span style="color:${p.color}">● </span>` +
            `${p.seriesName}: ${valStr} ${meta?.units ?? ''}` +
            `</div>`
        }
        return html
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
    yAxis: yAxes,
    series,
  }, true)
  // resize after DOM updates modal width
  nextTick(() => chart.value?.resize())
}

onMounted(async () => {
  if (chartEl.value) {
    chart.value = echarts.init(chartEl.value, null, { renderer: 'canvas' })
    chart.value.on('click', (params: any) => {
      const mode = TABS.find(t => t.key === activeTab.value)!.mode
      timeStore.goToIndex(params.dataIndex)
      const items = buildItems(mode)
      if (items[params.dataIndex]) { timeStore.setMode(mode); emit('close') }
    })
    chart.value.on('mouseover', (params: any) => {
      if (params.componentType === 'series') hoveredSeries.value = params.seriesName
    })
    chart.value.on('globalout', () => { hoveredSeries.value = null })
    await loadActiveTab()
  }
})

watch(activeTab, loadActiveTab)
watch(() => timeStore.currentIndex, updateChart)
</script>

<template>
  <div class="modal-backdrop" @click.self="emit('close')">
    <div class="modal-box" :style="{ width: modalWidth + 'px' }">
      <div class="modal-head">
        <span class="modal-title">区域历史 · {{ regionStore.selRegion?.name ?? '—' }}</span>
        <button class="modal-close" @click="emit('close')">✕</button>
      </div>

      <div class="modal-tabs">
        <button
          v-for="t in TABS" :key="t.key"
          class="tab-btn"
          :class="{ active: activeTab === t.key }"
          @click="activeTab = t.key"
        >{{ t.label }}</button>

        <!-- Add button fixed on left, selected var chips grow to the right -->
        <div class="var-chips">
          <div class="dropdown-wrap" style="position: relative">
            <button class="add-var-btn" @click="varPickerOpen = !varPickerOpen">+ 添加变量</button>
            <div v-if="varPickerOpen" class="var-picker">
              <template v-for="g in VAR_GROUPS" :key="g.id">
                <div class="picker-group">{{ g.label }}</div>
                <button
                  v-for="vn in g.vars" :key="vn"
                  class="picker-item"
                  :disabled="activeVars.includes(vn)"
                  @click="addVar(vn)"
                >{{ vn }} <span class="picker-name">{{ VARS[vn].long_name }}</span></button>
              </template>
            </div>
            <div v-if="varPickerOpen" class="picker-backdrop" @click="varPickerOpen = false" />
          </div>

          <span
            v-for="vn in activeVars" :key="vn"
            class="var-chip"
            :style="{ borderColor: SERIES_COLORS[activeVars.indexOf(vn) % SERIES_COLORS.length] }"
          >
            {{ vn }}
            <button v-if="activeVars.length > 1" class="chip-rm" @click="removeVar(vn)">×</button>
          </span>
        </div>
      </div>

      <div ref="chartEl" class="chart-area" />
    </div>
  </div>
</template>

<style scoped>
.modal-backdrop {
  position: fixed; inset: 0;
  background: rgba(7,9,12,0.7);
  backdrop-filter: blur(3px);
  z-index: 1200;
  display: flex; align-items: center; justify-content: center;
}
.modal-box {
  background: var(--bg-1);
  border: 1px solid var(--line-3);
  /* width set dynamically via :style; hard limits prevent overflow */
  min-width: 720px;
  max-width: calc(100vw - 40px);
  display: flex; flex-direction: column;
}
.modal-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 16px; border-bottom: 1px solid var(--line-1); background: var(--bg-2);
}
.modal-title { font-family: var(--font-mono); font-size: 12px; color: var(--fg-1); }
.modal-close { background: none; border: none; color: var(--fg-3); cursor: pointer; font-size: 12px; padding: 2px 6px; }
.modal-close:hover { color: var(--fg-0); }

.modal-tabs {
  display: flex; align-items: center;
  border-bottom: 1px solid var(--line-1);
}
.tab-btn {
  height: 36px; padding: 0 16px;
  background: none; border: none; border-right: 1px solid var(--line-1);
  color: var(--fg-3); font-size: 12px; cursor: pointer;
}
.tab-btn:hover { background: var(--bg-3); color: var(--fg-1); }
.tab-btn.active { color: var(--accent); background: var(--accent-faint); }

.var-chips { display: flex; align-items: center; gap: 4px; padding: 0 12px; flex: 1; flex-wrap: wrap; }
.var-chip {
  display: flex; align-items: center; gap: 2px;
  padding: 2px 6px; border: 1px solid; font-family: var(--font-mono); font-size: 10px; color: var(--fg-1);
}
.chip-rm { background: none; border: none; color: var(--fg-3); cursor: pointer; font-size: 11px; padding: 0 2px; }
.add-var-btn {
  height: 22px; padding: 0 8px; background: var(--bg-2); border: 1px solid var(--line-2);
  color: var(--fg-2); font-size: 11px; cursor: pointer; white-space: nowrap;
}
.add-var-btn:hover { background: var(--bg-3); color: var(--fg-0); }

.var-picker {
  position: absolute; top: calc(100% + 4px); left: 0;
  z-index: 1300; background: var(--bg-1); border: 1px solid var(--line-3);
  width: 200px; max-height: 280px; overflow-y: auto; padding: 4px 0;
}
.picker-backdrop { position: fixed; inset: 0; z-index: 1299; }
.picker-group { padding: 5px 10px 2px; font-size: 9px; color: var(--fg-3); letter-spacing: 0.1em; text-transform: uppercase; }
.picker-item {
  display: flex; align-items: center; gap: 6px; width: 100%; padding: 5px 10px;
  background: none; border: none; color: var(--fg-1); font-size: 11px; cursor: pointer; text-align: left;
}
.picker-item:hover:not(:disabled) { background: var(--bg-3); }
.picker-item:disabled { opacity: 0.4; cursor: default; }
.picker-name { color: var(--fg-3); font-size: 10px; }

.chart-area { width: 100%; height: 460px; }
</style>
