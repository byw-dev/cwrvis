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
      >
        <span class="num">{{ m.num }}</span>
        {{ m.label }}
      </div>
    </div>

    <!-- Right end -->
    <div class="pn-end">
      <button class="ico" title="帮助" aria-label="帮助">?</button>
      <button class="ico" title="设置" aria-label="设置" @click="emit('open-settings')">⚙</button>
      <div class="who">
        <span class="avatar" aria-hidden="true">RY</span>
        <span>研究员</span>
      </div>
    </div>
  </nav>
</template>

<style scoped>
.product-nav {
  position: fixed;
  top: 0; left: 0; right: 0;
  height: var(--h-nav);
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
  gap: 10px;
  padding: 0 16px 0 18px;
  border-right: 1px solid var(--line-2);
  min-width: 250px;
  flex-shrink: 0;
}

.text {
  display: flex;
  flex-direction: column;
  line-height: 1.15;
}

.text .t {
  font-size: 13px;
  font-weight: 600;
  color: var(--fg-0);
  letter-spacing: 0.01em;
}

.text .s {
  font-size: 9px;
  color: var(--fg-3);
  letter-spacing: 0.22em;
  font-family: var(--font-mono);
  text-transform: uppercase;
  margin-top: 2px;
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
  padding: 0 18px;
  font-size: 12px;
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

.num {
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--fg-3);
  margin-right: 6px;
  letter-spacing: 0.1em;
}

.tab.active .num { color: var(--accent-dim); }

/* ── Right end ── */
.pn-end {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 8px;
  flex-shrink: 0;
}

.ico {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  color: var(--fg-2);
  cursor: pointer;
  font-family: var(--font-mono);
  font-size: 14px;
}

.ico:hover { color: var(--accent); background: var(--bg-2); }

.who {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px 0 8px;
  font-size: 11px;
  color: var(--fg-1);
  border-left: 1px solid var(--line-2);
  margin-left: 4px;
  height: 100%;
}

.avatar {
  width: 22px;
  height: 22px;
  background: linear-gradient(135deg, #2e7d92, #58e0ff);
  color: var(--bg-0);
  font-weight: 600;
  font-size: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-mono);
  flex-shrink: 0;
}
</style>
