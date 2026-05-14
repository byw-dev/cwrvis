<script setup lang="ts">
import { MODULE_LIST, type ModuleId } from '@/types'

const props  = defineProps<{ activeModule: ModuleId }>()
const emit   = defineEmits<{
  'update:activeModule': [id: ModuleId]
  'open-settings': []
}>()

function select(id: ModuleId) {
  emit('update:activeModule', id)
}
</script>

<template>
  <nav class="product-nav">
    <!-- Brand -->
    <div class="pn-brand">
      <svg class="mark" viewBox="0 0 18 18" width="18" height="18">
        <polygon points="9,0 18,6.3 14.4,18 3.6,18 0,6.3" fill="var(--accent)" />
      </svg>
      <div class="text">
        <span class="t">云水资源数据平台</span>
        <span class="s">CWR · DATA PLATFORM v0.1</span>
      </div>
    </div>

    <!-- Module tabs -->
    <div class="pn-tabs">
      <div
        v-for="m in MODULE_LIST"
        :key="m.id"
        class="tab"
        :class="{ active: activeModule === m.id }"
        @click="select(m.id)"
      >{{ m.label }}</div>
    </div>

    <!-- Right end -->
    <div class="pn-end">
      <button class="ico" title="帮助" aria-label="帮助">?</button>
      <button class="ico" title="设置" aria-label="设置" @click="emit('open-settings')">⚙</button>
    </div>
  </nav>
</template>

<style scoped>
.product-nav {
  position: fixed;
  top: 0; left: 0; right: 0;
  min-height: var(--h-nav);
  display: flex;
  align-items: stretch;
  background: rgba(7, 9, 12, 0.96);
  border-bottom: 1px solid var(--line-2);
  z-index: 800;
}

/* ── Brand ── */
.pn-brand {
  display: flex;
  align-items: center;
  gap: 0.625em;
  padding: 0 1em 0 1.125em;
  border-right: 1px solid var(--line-2);
  min-width: 15rem;
  flex-shrink: 0;
}

.text {
  display: flex;
  flex-direction: column;
  line-height: 1.15;
}

.text .t {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--fg-0);
  letter-spacing: 0.01em;
}

.text .s {
  font-size: 0.5625rem;
  color: var(--fg-3);
  letter-spacing: 0.22em;
  font-family: var(--font-mono);
  text-transform: uppercase;
  margin-top: 0.2em;
}

/* ── Tabs ── */
.pn-tabs {
  display: flex;
  align-items: stretch;
  flex: 1;
  overflow: hidden;
}

.tab {
  position: relative;
  display: flex;
  align-items: center;
  padding: 0 1.125em;
  font-size: 0.75rem;
  color: var(--fg-2);
  cursor: pointer;
  border-right: 1px solid var(--line-1);
  white-space: nowrap;
  user-select: none;
  transition: color 0.1s, background 0.1s;
}

.tab:last-child { border-right: none; }

.tab:hover {
  color: var(--fg-0);
  background: var(--bg-2);
}

.tab.active {
  color: var(--accent);
  background: var(--bg-1);
}

.tab.active::after {
  content: '';
  position: absolute;
  left: 0; right: 0; bottom: -1px;
  height: 2px;
  background: var(--accent);
}


/* ── Right end ── */
.pn-end {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 8px;
  flex-shrink: 0;
  margin-left: auto;
}

.ico {
  min-width: 2rem;
  min-height: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  color: var(--fg-2);
  cursor: pointer;
  font-family: var(--font-mono);
  font-size: 0.875rem;
  padding: 0.25em;
}

.ico:hover { color: var(--accent); background: var(--bg-2); }

</style>
