<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useTimeStore, AGG_MODES_RAW, AGG_MODES_STAT, AGG_MODE_LABELS } from '@/stores/time'
import { useVarStore } from '@/stores/var'
import { useRegionStore } from '@/stores/region'
import { VARS, VAR_GROUPS } from '@/config/vars'
import { SEASONS, YEAR_MIN, YEAR_MAX, fmtMonth } from '@/config/constants'
import type { ModuleId, AggMode } from '@/types'

const props = defineProps<{ activeModule: ModuleId }>()

const timeStore   = useTimeStore()
const varStore    = useVarStore()
const regionStore = useRegionStore()

const varOpen    = ref(false)
const regionOpen = ref(false)

// Export form year selection
const exportYear = ref<number | 'all'>('all')
const exportYearOpen = ref(false)
const EXPORT_YEARS = ['all', ...Array.from({ length: YEAR_MAX - YEAR_MIN + 1 }, (_, i) => YEAR_MIN + i)]

onMounted(() => { if (props.activeModule === 'region') regionStore.loadRegions() })

// ── Computed helpers ──────────────────────────────────────────────────────────

const vm = computed(() => VARS[varStore.selVar])

const frameCount = computed(() => {
  switch (timeStore.mode) {
    case 'monthly':     return 312
    case 'yearly':      return 26
    case 'avg_yearly':  return 1
    case 'avg_monthly': return 12
    case 'avg_season':  return 4
  }
})

const selRegionName = computed(() =>
  regionStore.selRegion?.name ?? '西藏自治区（全区）'
)
</script>

<template>
  <div class="subtoolbar">

    <!-- ── GRID / REGION form ─────────────────────────────────────────────── -->
    <template v-if="activeModule === 'grid' || activeModule === 'region'">

      <!-- Var picker button -->
      <div class="dropdown-wrap">
        <button class="var-btn" @click="varOpen = !varOpen">
          <span class="var-code">{{ vm.name }}</span>
          <span class="var-sep">·</span>
          <span class="var-name">{{ vm.long_name }}</span>
          <span class="var-unit">[{{ vm.units }}]</span>
          <span class="caret">▾</span>
        </button>
        <div v-if="varOpen" class="dropdown var-dropdown">
          <template v-for="g in VAR_GROUPS" :key="g.id">
            <div class="dropdown-group-label">{{ g.label }}</div>
            <button
              v-for="vn in g.vars" :key="vn"
              class="dropdown-item"
              :class="{ active: varStore.selVar === vn }"
              @click="varStore.selectVar(vn); varOpen = false"
            >
              <span class="item-code">{{ vn }}</span>
              <span class="item-name">{{ VARS[vn].long_name }}</span>
              <span class="item-unit">[{{ VARS[vn].units }}]</span>
            </button>
          </template>
        </div>
        <div v-if="varOpen" class="dropdown-backdrop" @click="varOpen = false" />
      </div>

      <div class="toolbar-sep" />

      <!-- Raw modes -->
      <div class="mode-group">
        <span class="mode-group-label">原始</span>
        <button
          v-for="m in AGG_MODES_RAW" :key="m"
          class="mode-btn"
          :class="{ active: timeStore.mode === m }"
          @click="timeStore.setMode(m)"
        >{{ AGG_MODE_LABELS[m] }}</button>
      </div>

      <!-- Stat modes -->
      <div class="mode-group">
        <span class="mode-group-label">统计</span>
        <button
          v-for="m in AGG_MODES_STAT" :key="m"
          class="mode-btn"
          :class="{ active: timeStore.mode === m }"
          @click="timeStore.setMode(m)"
        >{{ AGG_MODE_LABELS[m] }}</button>
      </div>

      <!-- Region picker (region module only) -->
      <template v-if="activeModule === 'region'">
        <div class="toolbar-sep" />
        <div class="dropdown-wrap">
          <button class="region-btn" @click="regionOpen = !regionOpen">
            <span>{{ selRegionName }}</span>
            <span class="caret">▾</span>
          </button>
          <div v-if="regionOpen" class="dropdown region-dropdown">
            <button
              class="dropdown-item"
              :class="{ active: regionStore.selRegionId === 'xizang' }"
              @click="regionStore.selectRegion('xizang'); regionOpen = false"
            >
              <span class="region-dot">●</span>西藏自治区（全区）
            </button>
            <div class="dropdown-divider" />
            <button
              v-for="r in regionStore.regions.filter(r => r.level === 'prefecture')"
              :key="r.region_id"
              class="dropdown-item region-item"
              :class="{ active: regionStore.selRegionId === r.region_id }"
              @click="regionStore.selectRegion(r.region_id as any); regionOpen = false"
            >{{ r.name }}</button>
          </div>
          <div v-if="regionOpen" class="dropdown-backdrop" @click="regionOpen = false" />
        </div>
      </template>

      <!-- Mode params (right-aligned) -->
      <div class="toolbar-params">
        <template v-if="timeStore.mode === 'monthly'">
          <span class="param-mono">YEAR {{ timeStore.sel.year }}</span>
          <span class="param-sep">·</span>
          <span class="param-mono">MONTH {{ String(timeStore.sel.month).padStart(2, '0') }}</span>
          <span class="param-sep">·</span>
          <span class="param-dim">312帧</span>
        </template>
        <template v-else-if="timeStore.mode === 'yearly'">
          <span class="param-mono">YEAR {{ timeStore.sel.year }}</span>
          <span class="param-sep">·</span>
          <span class="param-dim">26帧</span>
        </template>
        <template v-else-if="timeStore.mode === 'avg_yearly'">
          <span class="param-dim">RANGE {{ YEAR_MIN }}–{{ YEAR_MAX }} 全期均值 · 1帧（静态）</span>
        </template>
        <template v-else-if="timeStore.mode === 'avg_monthly'">
          <div class="dropdown-wrap">
            <button class="param-btn" @click="varOpen = false">
              {{ String(timeStore.sel.month).padStart(2, '0') }}月 ▾
            </button>
            <!-- Inline month picker -->
            <select
              class="month-select"
              :value="timeStore.sel.month"
              @change="timeStore.goToIndex(($event.target as HTMLSelectElement).value as any - 1)"
            >
              <option v-for="m in 12" :key="m" :value="m">
                {{ String(m).padStart(2, '0') }}月
              </option>
            </select>
          </div>
          <span class="param-sep">·</span>
          <span class="param-dim">12帧</span>
        </template>
        <template v-else-if="timeStore.mode === 'avg_season'">
          <button
            v-for="s in SEASONS" :key="s.id"
            class="season-pill"
            :class="{ active: timeStore.sel.season === s.id }"
            @click="timeStore.goToIndex(SEASONS.findIndex(x => x.id === s.id))"
          >{{ s.label }}</button>
          <span class="param-sep">·</span>
          <span class="param-dim">4帧</span>
        </template>
      </div>
    </template>

    <!-- ── EXPORT form ────────────────────────────────────────────────────── -->
    <template v-else-if="activeModule === 'export'">
      <div class="dropdown-wrap">
        <button class="region-btn" @click="regionOpen = !regionOpen">
          <span>{{ selRegionName }}</span>
          <span class="caret">▾</span>
        </button>
        <div v-if="regionOpen" class="dropdown region-dropdown">
          <button
            class="dropdown-item"
            :class="{ active: regionStore.selRegionId === 'xizang' }"
            @click="regionStore.selectRegion('xizang'); regionOpen = false"
          >
            <span class="region-dot">●</span>西藏自治区（全区）
          </button>
          <div class="dropdown-divider" />
          <button
            v-for="r in regionStore.regions.filter(r => r.level === 'prefecture')"
            :key="r.region_id"
            class="dropdown-item region-item"
            :class="{ active: regionStore.selRegionId === r.region_id }"
            @click="regionStore.selectRegion(r.region_id as any); regionOpen = false"
          >{{ r.name }}</button>
        </div>
        <div v-if="regionOpen" class="dropdown-backdrop" @click="regionOpen = false" />
      </div>

      <div class="toolbar-sep" />

      <!-- Year picker -->
      <div class="dropdown-wrap">
        <button class="param-btn" @click="exportYearOpen = !exportYearOpen">
          {{ exportYear === 'all' ? '全部年份' : exportYear }} ▾
        </button>
        <div v-if="exportYearOpen" class="dropdown year-dropdown">
          <button
            v-for="y in EXPORT_YEARS" :key="y"
            class="dropdown-item"
            :class="{ active: exportYear === y }"
            @click="exportYear = y as any; exportYearOpen = false"
          >{{ y === 'all' ? '全部' : y }}</button>
        </div>
        <div v-if="exportYearOpen" class="dropdown-backdrop" @click="exportYearOpen = false" />
      </div>
    </template>

  </div>
</template>

<style scoped>
.subtoolbar {
  position: fixed;
  top: var(--h-nav);
  left: 0; right: 0;
  height: var(--h-sub);
  z-index: 799;
  background: var(--bg-1);
  border-bottom: 1px solid var(--line-1);
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 12px;
  overflow: visible;
}

/* ── Var button ── */
.var-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  height: 28px;
  padding: 0 10px;
  background: var(--bg-2);
  border: 1px solid var(--line-2);
  color: var(--fg-0);
  font-family: var(--font-ui);
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
}
.var-btn:hover { background: var(--bg-3); }

.var-code { font-family: var(--font-mono); color: var(--accent); font-size: 11px; }
.var-sep  { color: var(--fg-3); }
.var-name { color: var(--fg-1); }
.var-unit { font-family: var(--font-mono); color: var(--fg-3); font-size: 10px; }
.caret    { color: var(--fg-3); font-size: 9px; }

/* ── Mode groups ── */
.mode-group {
  display: flex;
  align-items: center;
  gap: 0;
  border: 1px solid var(--line-2);
  height: 28px;
}

.mode-group-label {
  padding: 0 7px;
  font-size: 10px;
  color: var(--fg-3);
  letter-spacing: 0.02em;
  border-right: 1px solid var(--line-2);
  height: 100%;
  display: flex;
  align-items: center;
}

.mode-btn {
  height: 100%;
  padding: 0 10px;
  background: none;
  border: none;
  border-right: 1px solid var(--line-2);
  color: var(--fg-2);
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
}
.mode-btn:last-child { border-right: none; }
.mode-btn:hover { background: var(--bg-3); color: var(--fg-0); }
.mode-btn.active { background: var(--accent-faint); color: var(--accent); }

/* ── Region button ── */
.region-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 10px;
  background: var(--bg-2);
  border: 1px solid var(--line-2);
  color: var(--fg-0);
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
}
.region-btn:hover { background: var(--bg-3); }

/* ── Separator ── */
.toolbar-sep {
  width: 1px;
  height: 20px;
  background: var(--line-2);
  flex-shrink: 0;
  margin: 0 4px;
}

/* ── Mode params ── */
.toolbar-params {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 6px;
}

.param-mono { font-family: var(--font-mono); font-size: 11px; color: var(--fg-1); }
.param-sep  { color: var(--fg-3); font-size: 10px; }
.param-dim  { font-family: var(--font-mono); font-size: 10px; color: var(--fg-3); }

.param-btn {
  height: 22px;
  padding: 0 8px;
  background: var(--bg-2);
  border: 1px solid var(--line-2);
  color: var(--accent);
  font-family: var(--font-mono);
  font-size: 11px;
  cursor: pointer;
}

/* Hide native select, overlay param-btn visually */
.month-select {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
  width: 100%;
}

.season-pill {
  height: 22px;
  padding: 0 8px;
  background: var(--bg-2);
  border: 1px solid var(--line-2);
  color: var(--fg-2);
  font-size: 12px;
  cursor: pointer;
}
.season-pill.active {
  background: var(--accent-faint);
  color: var(--accent);
  border-color: var(--accent-dim);
}

/* ── Dropdowns ── */
.dropdown-wrap {
  position: relative;
}

.dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  z-index: 900;
  background: var(--bg-1);
  border: 1px solid var(--line-3);
  min-width: 180px;
  max-height: 320px;
  overflow-y: auto;
  padding: 4px 0;
}

.var-dropdown  { min-width: 240px; }
.region-dropdown { min-width: 160px; }
.year-dropdown { min-width: 100px; max-height: 240px; }

.dropdown-backdrop {
  position: fixed;
  inset: 0;
  z-index: 899;
}

.dropdown-group-label {
  padding: 6px 10px 3px;
  font-size: 9px;
  letter-spacing: 0.1em;
  color: var(--fg-3);
  text-transform: uppercase;
  border-top: 1px solid var(--line-1);
}
.dropdown-group-label:first-child { border-top: none; }

.dropdown-item {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 5px 10px;
  background: none;
  border: none;
  color: var(--fg-1);
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}
.dropdown-item:hover { background: var(--bg-3); }
.dropdown-item.active { color: var(--accent); background: var(--accent-faint); }

.item-code { font-family: var(--font-mono); font-size: 10px; color: var(--accent); min-width: 52px; }
.item-name { flex: 1; font-size: 11px; }
.item-unit { font-family: var(--font-mono); font-size: 9px; color: var(--fg-3); }

.region-dot { color: var(--accent); margin-right: 2px; }
.region-item { padding-left: 20px; }

.dropdown-divider {
  height: 1px;
  background: var(--line-1);
  margin: 3px 0;
}
</style>
