<script setup lang="ts">
import { ref, computed } from 'vue'
import { useVarStore } from '@/stores/var'
import { VAR_GROUPS } from '@/config/vars'
import type { VarGroupId } from '@/types'
import CategoryFlyout from './CategoryFlyout.vue'

const varStore  = useVarStore()
const openGroup = ref<VarGroupId | 'search' | null>(null)

function toggle(id: VarGroupId | 'search') {
  openGroup.value = openGroup.value === id ? null : id
}

// Icon SVG paths (22×22 viewBox, stroke, no fill)
const ICONS: Record<VarGroupId | 'search' | 'export', string> = {
  cwr:    '<path d="M11 3.5C9 7 4 12 4 15a7 7 0 0 0 14 0C18 12 13 7 11 3.5Z"/>',
  state:  '<line x1="4" y1="8" x2="18" y2="8"/><line x1="4" y1="11.5" x2="18" y2="11.5"/><line x1="4" y1="15" x2="18" y2="15"/>',
  flux:   '<path d="M4 9h12"/><path d="M13 5.5l3.5 3.5L13 12.5"/><path d="M18 14H6"/><path d="M9 10.5L5.5 14 9 17.5"/>',
  conv:   '<path d="M5.5 7.5A6.5 6.5 0 0 1 16.5 8"/><path d="M16.5 6l1 3-3 .5"/><path d="M16.5 14.5A6.5 6.5 0 0 1 5.5 14"/><path d="M5.5 16l-1-3 3-.5"/>',
  renew:  '<circle cx="11" cy="11" r="7"/><path d="M11 7.5V11l2.5 2"/>',
  search: '<circle cx="9.5" cy="9.5" r="5.5"/><line x1="13.5" y1="13.5" x2="18" y2="18"/>',
  export: '<path d="M11 5v11"/><path d="M6.5 13l4.5 5 4.5-5"/><line x1="4" y1="19" x2="18" y2="19"/>',
}

const GROUPS = VAR_GROUPS   // [{id, label, vars}]
</script>

<template>
  <!-- Backdrop: click outside flyout to close -->
  <div
    v-if="openGroup !== null"
    class="rail-backdrop"
    @click="openGroup = null"
  />

  <!-- CategoryFlyout -->
  <Transition name="flyout-slide">
    <CategoryFlyout
      v-if="openGroup !== null"
      :group-id="openGroup"
      class="flyout-panel"
      @close="openGroup = null"
    />
  </Transition>

  <!-- Left rail strip -->
  <nav class="left-rail" aria-label="变量分组">
    <span class="rail-label">LAYERS</span>

    <!-- 5 group buttons -->
    <button
      v-for="g in GROUPS"
      :key="g.id"
      class="rail-btn"
      :class="{
        active:   varStore.varGroup === g.id,
        selected: openGroup === g.id,
      }"
      :title="`${g.label}（${g.vars.length} 个变量）`"
      @click="toggle(g.id)"
    >
      <svg
        viewBox="0 0 22 22" width="22" height="22"
        fill="none" stroke="currentColor" stroke-width="1.5"
        stroke-linecap="round" stroke-linejoin="round"
        v-html="ICONS[g.id]"
      />
      <span class="rail-btn-label">{{ g.label }}</span>
    </button>

    <div class="rail-spacer" />

    <!-- Search button -->
    <button
      class="rail-btn"
      :class="{ selected: openGroup === 'search' }"
      title="搜索全部变量"
      @click="toggle('search')"
    >
      <svg
        viewBox="0 0 22 22" width="22" height="22"
        fill="none" stroke="currentColor" stroke-width="1.5"
        stroke-linecap="round" stroke-linejoin="round"
        v-html="ICONS.search"
      />
    </button>

    <!-- Export placeholder -->
    <button class="rail-btn" title="导出（待实现）" disabled>
      <svg
        viewBox="0 0 22 22" width="22" height="22"
        fill="none" stroke="currentColor" stroke-width="1.5"
        stroke-linecap="round" stroke-linejoin="round"
        v-html="ICONS.export"
      />
    </button>
  </nav>
</template>

<style scoped>
/* ── Rail strip ── */
.left-rail {
  position: fixed;
  left: 0;
  top: calc(var(--h-nav) + var(--h-sub));
  bottom: var(--h-bottom);
  width: var(--w-rail);
  z-index: 700;
  background: var(--bg-1);
  border-right: 1px solid var(--line-1);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 6px 0;
  gap: 2px;
}

.rail-label {
  font-family: var(--font-mono);
  font-size: 8px;
  letter-spacing: 0.1em;
  color: var(--fg-3);
  text-transform: uppercase;
  margin-bottom: 4px;
}

.rail-spacer { flex: 1; }

/* ── Group buttons ── */
.rail-btn {
  width: 44px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 5px 0;
  background: none;
  border: none;
  color: var(--fg-3);
  cursor: pointer;
  border-left: 2px solid transparent;
  transition: color 0.1s;
}

.rail-btn:hover:not(:disabled) {
  color: var(--fg-1);
  background: var(--bg-3);
}

.rail-btn.active {
  color: var(--accent);
}

.rail-btn.selected {
  color: var(--accent);
  background: var(--accent-faint);
  border-left-color: var(--accent);
}

.rail-btn:disabled {
  cursor: default;
  opacity: 0.35;
}

.rail-btn-label {
  font-family: var(--font-ui);
  font-size: 9px;
  color: inherit;
  letter-spacing: 0.02em;
  line-height: 1;
  white-space: nowrap;
}

/* ── Flyout panel ── */
.flyout-panel {
  position: fixed;
  left: var(--w-rail);
  top: calc(var(--h-nav) + var(--h-sub));
  bottom: var(--h-bottom);
  width: 260px;
  z-index: 700;
}

/* Transparent backdrop to catch outside clicks */
.rail-backdrop {
  position: fixed;
  inset: 0;
  z-index: 699;
}

/* Slide-in transition */
.flyout-slide-enter-active,
.flyout-slide-leave-active {
  transition: transform 0.15s ease, opacity 0.15s ease;
}
.flyout-slide-enter-from,
.flyout-slide-leave-to {
  transform: translateX(-8px);
  opacity: 0;
}
</style>
