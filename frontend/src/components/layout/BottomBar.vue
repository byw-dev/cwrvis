<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useTimeStore, MODE_LABELS } from '@/stores/time'
import { useSettingsStore } from '@/stores/settings'
import { SEASON_BY_ID } from '@/config/constants'
import type { AggMode } from '@/types'

const timeStore     = useTimeStore()
const settingsStore = useSettingsStore()

const trackRef = ref<HTMLElement | null>(null)
const SPEEDS: number[] = [0.5, 1, 2, 4]

// ── Derived state ─────────────────────────────────────────────────────────────

const items       = computed(() => timeStore.items)
const isStatic    = computed(() => items.value.length <= 1)
const fillPct     = computed(() => {
  const len = items.value.length
  if (len <= 1) return 0
  return (timeStore.currentIndex / (len - 1)) * 100
})
const currentSpeed = computed(() => settingsStore.getSpeed(timeStore.mode))

const currentFrameLabel = computed(() => {
  const s = timeStore.sel
  switch (timeStore.mode) {
    case 'monthly':     return `${s.year}-${String(s.month).padStart(2, '0')}`
    case 'yearly':      return String(s.year)
    case 'avg_yearly':  return '2000–2025 均值'
    case 'avg_monthly': return `${String(s.month).padStart(2, '0')} 月均`
    case 'avg_season':  return SEASON_BY_ID[s.season]?.label ?? s.season
  }
})

// ── Playback interval (setInterval per DEC-010) ───────────────────────────────

const intervalId = ref<ReturnType<typeof setInterval> | null>(null)

function stopInterval() {
  if (intervalId.value !== null) {
    clearInterval(intervalId.value)
    intervalId.value = null
  }
}

function startInterval() {
  stopInterval()
  if (!timeStore.playing || isStatic.value) return
  const ms = Math.max(80, 1000 / currentSpeed.value)
  intervalId.value = setInterval(() => timeStore.stepForwardWrapping(), ms)
}

// Restart whenever play state, mode, or speed changes
watch(
  [() => timeStore.playing, () => timeStore.mode, currentSpeed],
  startInterval,
  { immediate: true },
)

onUnmounted(stopInterval)

// ── Speed control ─────────────────────────────────────────────────────────────

function setSpeed(s: number) {
  settingsStore.setSpeed(timeStore.mode as AggMode, s)
  // Restart interval with new speed if playing
  if (timeStore.playing) startInterval()
}

// ── Timeline scrubbing ────────────────────────────────────────────────────────

function tickPct(i: number): number {
  const len = items.value.length
  return len <= 1 ? 50 : (i / (len - 1)) * 100
}

function seekFromEvent(e: MouseEvent) {
  const el = trackRef.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const f    = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
  const idx  = Math.round(f * (items.value.length - 1))
  timeStore.goToIndex(idx)
}

function onTrackMousedown(e: MouseEvent) {
  seekFromEvent(e)
  const onMove = (ev: MouseEvent) => seekFromEvent(ev)
  const onUp   = () => {
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
  }
  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}

// ── Keyboard shortcuts ────────────────────────────────────────────────────────

function onKeydown(e: KeyboardEvent) {
  const tag = (e.target as HTMLElement).tagName
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
  if (e.key === 'ArrowLeft')  { e.preventDefault(); timeStore.stepBack() }
  if (e.key === 'ArrowRight') { e.preventDefault(); timeStore.stepForward() }
  if (e.key === ' ')          { e.preventDefault(); timeStore.playing = !timeStore.playing }
}

onMounted(()   => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div class="bottombar">
    <!-- Controls row -->
    <div class="tl-head">
      <!-- Playback buttons: prev · play/pause · next -->
      <template v-if="!isStatic">
        <button
          class="pbtn"
          :disabled="timeStore.currentIndex === 0"
          title="上一帧 (←)"
          @click="timeStore.stepBack()"
        >
          <!-- prev icon -->
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <rect x="2" y="2" width="1.5" height="8" fill="currentColor" />
            <polygon points="10,2 10,10 4,6" fill="currentColor" />
          </svg>
        </button>
        <button
          class="pbtn play"
          :title="timeStore.playing ? '暂停 (Space)' : '播放 (Space)'"
          @click="timeStore.playing = !timeStore.playing"
        >
          <!-- pause icon -->
          <svg v-if="timeStore.playing" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <rect x="2.5" y="2" width="2.5" height="8" fill="currentColor" />
            <rect x="7"   y="2" width="2.5" height="8" fill="currentColor" />
          </svg>
          <!-- play icon -->
          <svg v-else width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <polygon points="2.5,2 2.5,10 10,6" fill="currentColor" />
          </svg>
        </button>
        <button
          class="pbtn"
          :disabled="timeStore.currentIndex >= items.length - 1"
          title="下一帧 (→)"
          @click="timeStore.stepForward()"
        >
          <!-- next icon -->
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <polygon points="2,2 2,10 8,6" fill="currentColor" />
            <rect x="8.5" y="2" width="1.5" height="8" fill="currentColor" />
          </svg>
        </button>
      </template>

      <!-- Mode tag -->
      <span class="tl-mode-tag">
        MODE · <span class="v">{{ MODE_LABELS[timeStore.mode] }}</span>
      </span>

      <!-- Current frame -->
      <span class="tl-frame">
        <span class="now">{{ currentFrameLabel }}</span>
        <span v-if="!isStatic" class="frac">
          {{ timeStore.currentIndex + 1 }} / {{ items.length }}
        </span>
      </span>

      <div class="spacer" />

      <!-- Speed selector -->
      <template v-if="!isStatic">
        <span class="spd-lbl">SPEED</span>
        <div class="speed">
          <div
            v-for="s in SPEEDS"
            :key="s"
            class="s"
            :class="{ active: currentSpeed === s }"
            @click="setSpeed(s)"
          >{{ s }}×</div>
        </div>
      </template>
    </div>

    <!-- Timeline track -->
    <div
      v-if="!isStatic"
      ref="trackRef"
      class="tl-track"
      @mousedown.prevent="onTrackMousedown"
    >
      <div class="tl-rail" />
      <div class="tl-fill" :style="{ width: fillPct + '%' }" />

      <template v-for="(item, i) in items" :key="i">
        <div
          class="tl-tick"
          :class="{ major: item.major }"
          :style="{ left: tickPct(i) + '%' }"
        />
        <div
          v-if="item.major && item.label"
          class="tl-label"
          :style="{ left: tickPct(i) + '%' }"
        >{{ item.label }}</div>
      </template>

      <div class="tl-handle" :style="{ left: fillPct + '%' }" />
    </div>

    <!-- Static frame notice -->
    <div v-else class="tl-static-msg">
      静态帧 · 该模式下时间已聚合
    </div>
  </div>
</template>

<style scoped>
.bottombar {
  position: fixed;
  bottom: 0; left: 0; right: 0;
  min-height: var(--h-bottom);
  background: rgba(13, 17, 23, 0.96);
  border-top: 1px solid var(--line-2);
  z-index: 800;
  display: flex;
  flex-direction: column;
  padding: 0.5em 1em 0.625em;
}

/* ── Controls row ── */
.tl-head {
  display: flex;
  align-items: center;
  gap: 0.375em;
  font-family: var(--font-mono);
  font-size: 0.6875rem;
  color: var(--fg-2);
  margin-bottom: 0.375em;
  flex-shrink: 0;
}

.pbtn {
  min-width: 1.875rem;
  padding: 0.25em 0.5em;
  display: flex; align-items: center; justify-content: center;
  background: var(--bg-2);
  border: 1px solid var(--line-2);
  color: var(--fg-1);
  cursor: pointer;
}

.pbtn:hover:not(:disabled) { background: var(--bg-3); color: var(--accent); }
.pbtn:disabled { opacity: 0.35; cursor: not-allowed; }

.pbtn.play {
  min-width: 2.375rem;
  background: var(--accent);
  color: var(--bg-0);
  border-color: var(--accent);
}
.pbtn.play:hover { filter: brightness(1.1); }

.tl-mode-tag {
  font-size: 0.5625rem;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--fg-3);
  margin-left: 0.5em;
}
.tl-mode-tag .v { color: var(--fg-1); }

.tl-frame { display: flex; align-items: baseline; gap: 0.625em; margin-left: 0.75em; }

.now  { color: var(--accent); font-weight: 600; font-size: 0.8125rem; letter-spacing: 0.05em; }
.frac { color: var(--fg-3); }

.spacer { flex: 1; }

.spd-lbl {
  font-size: 0.5625rem;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--fg-3);
}

.speed { display: flex; gap: 1px; }

.speed .s {
  padding: 0.1875em 0.5em;
  font-size: 0.625rem;
  cursor: pointer;
  color: var(--fg-2);
  background: var(--bg-2);
  border: 1px solid var(--line-2);
  user-select: none;
}
.speed .s:hover  { color: var(--fg-0); background: var(--bg-3); }
.speed .s.active { background: var(--accent); color: var(--bg-0); border-color: var(--accent); }

/* ── Track ── */
.tl-track {
  position: relative;
  flex: 1;
  cursor: pointer;
  margin-top: 2px;
}

.tl-rail {
  position: absolute;
  left: 0; right: 0; top: 16px;
  height: 2px;
  background: var(--line-2);
}

.tl-fill {
  position: absolute;
  left: 0; top: 16px;
  height: 2px;
  background: var(--accent);
  pointer-events: none;
}

.tl-tick {
  position: absolute;
  top: 10px;
  height: 8px;
  width: 1px;
  background: var(--line-2);
  pointer-events: none;
  transform: translateX(-50%);
}
.tl-tick.major { background: var(--fg-3); height: 14px; top: 10px; }

.tl-label {
  position: absolute;
  top: 26px;
  font-family: var(--font-mono);
  font-size: 0.5625rem;
  color: var(--fg-3);
  transform: translateX(-50%);
  pointer-events: none;
  white-space: nowrap;
}

.tl-handle {
  position: absolute;
  top: 8px;
  width: 12px; height: 18px;
  transform: translateX(-50%);
  background: var(--accent);
  border: 1px solid #fff;
  pointer-events: none;
}

/* ── Static notice ── */
.tl-static-msg {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-mono);
  font-size: 0.625rem;
  color: var(--fg-3);
  letter-spacing: 0.2em;
  text-transform: uppercase;
}
</style>
