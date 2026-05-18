<script setup lang="ts">
import { ref, computed } from 'vue'
import { useVarStore } from '@/stores/var'
import { VARS, VAR_GROUPS, VAR_GROUP_BY_ID } from '@/config/vars'
import type { VarGroupId, VarName } from '@/types'

const props = defineProps<{
  groupId: VarGroupId | 'search'
}>()

const emit = defineEmits<{
  close: []
}>()

const varStore = useVarStore()
const query    = ref('')

const group = computed(() =>
  props.groupId !== 'search' ? VAR_GROUP_BY_ID[props.groupId] : null
)

const title = computed(() =>
  props.groupId === 'search' ? '全部变量' : group.value!.label
)

const allVars = computed(() =>
  props.groupId === 'search'
    ? Object.values(VARS)
    : group.value!.vars.map(v => VARS[v])
)

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return allVars.value
  return allVars.value.filter(v =>
    v.name.toLowerCase().includes(q) || v.long_name.includes(q)
  )
})

function select(name: VarName) {
  varStore.selectVar(name)
  emit('close')
}
</script>

<template>
  <div class="flyout">
    <!-- Header -->
    <div class="flyout-head">
      <span class="flyout-title">{{ title }}</span>
      <span class="flyout-count">{{ allVars.length }}</span>
      <button class="flyout-close" @click="emit('close')">✕</button>
    </div>

    <!-- Search -->
    <div class="flyout-search">
      <input
        v-model="query"
        class="search-input"
        placeholder="搜索变量…"
        autocomplete="off"
        spellcheck="false"
      />
    </div>

    <!-- Var list -->
    <ul class="flyout-list">
      <li
        v-for="v in filtered"
        :key="v.name"
        class="flyout-item"
        :class="{ active: varStore.selVar === v.name }"
        @click="select(v.name)"
      >
        <span class="item-code">{{ v.name }}</span>
        <span class="item-name">{{ v.long_name }}</span>
        <span class="item-unit">[{{ v.units }}]</span>
      </li>
      <li v-if="filtered.length === 0" class="flyout-empty">无匹配变量</li>
    </ul>
  </div>
</template>

<style scoped>
.flyout {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-1);
  border-right: 1px solid var(--line-1);
  overflow: hidden;
}

/* ── Header ── */
.flyout-head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 12px;
  height: 36px;
  border-bottom: 1px solid var(--line-1);
  flex-shrink: 0;
}

.flyout-title {
  font-family: var(--font-mono);
  font-size: 0.6875rem;
  letter-spacing: 0.06em;
  color: var(--fg-1);
  text-transform: uppercase;
  flex: 1;
}

.flyout-count {
  font-family: var(--font-mono);
  font-size: 0.625rem;
  color: var(--fg-3);
}

.flyout-close {
  background: none;
  border: none;
  color: var(--fg-3);
  font-size: 0.6875rem;
  padding: 2px 4px;
  cursor: pointer;
  line-height: 1;
}
.flyout-close:hover { color: var(--fg-0); }

/* ── Search ── */
.flyout-search {
  padding: 8px 10px;
  border-bottom: 1px solid var(--line-1);
  flex-shrink: 0;
}

.search-input {
  width: 100%;
  background: var(--bg-2);
  border: 1px solid var(--line-2);
  color: var(--fg-0);
  font-family: var(--font-ui);
  font-size: 0.75rem;
  padding: 5px 8px;
  outline: none;
}
.search-input:focus { border-color: var(--accent-dim); }
.search-input::placeholder { color: var(--fg-3); }

/* ── List ── */
.flyout-list {
  list-style: none;
  margin: 0;
  padding: 4px 0;
  overflow-y: auto;
  flex: 1;
}

.flyout-item {
  display: grid;
  grid-template-columns: 52px 1fr auto;
  align-items: center;
  gap: 4px;
  padding: 6px 12px 6px 10px;
  cursor: pointer;
  border-left: 2px solid transparent;
}
.flyout-item:hover {
  background: var(--bg-3);
}
.flyout-item.active {
  border-left-color: var(--accent);
  background: var(--accent-faint);
}

.item-code {
  font-family: var(--font-mono);
  font-size: 0.6875rem;
  color: var(--accent);
}
.flyout-item.active .item-code { color: var(--accent); }

.item-name {
  font-size: 0.75rem;
  color: var(--fg-1);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-unit {
  font-family: var(--font-mono);
  font-size: 0.625rem;
  color: var(--fg-3);
  white-space: nowrap;
}

.flyout-empty {
  padding: 16px 12px;
  font-size: 0.75rem;
  color: var(--fg-3);
  text-align: center;
}
</style>
