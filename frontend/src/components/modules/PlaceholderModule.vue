<script setup lang="ts">
import type { ModuleId, ModuleDef } from '@/types'
import { MODULE_LIST } from '@/types'

const props = defineProps<{ moduleId: ModuleId }>()

const def = MODULE_LIST.find((m): m is ModuleDef => m.id === props.moduleId)
</script>

<template>
  <div class="placeholder">
    <div class="inner">
      <div class="num">{{ def?.num ?? '—' }}</div>
      <div class="name">{{ def?.label ?? moduleId }}</div>
      <div class="msg">该模块正在建设中</div>
    </div>
  </div>
</template>

<style scoped>
.placeholder {
  position: fixed;
  top: calc(var(--h-nav) + var(--h-sub));
  left: 0; right: 0;
  bottom: var(--h-bottom);
  display: flex;
  align-items: center;
  justify-content: center;
}

.inner {
  text-align: center;
  font-family: var(--font-mono);
}

.num {
  font-size: 0.6875rem;
  letter-spacing: 0.3em;
  color: var(--fg-3);
  margin-bottom: 8px;
}

.name {
  font-size: 1.25rem;
  color: var(--fg-1);
  font-weight: 600;
  margin-bottom: 12px;
}

.msg {
  font-size: 0.6875rem;
  color: var(--fg-3);
  letter-spacing: 0.1em;
}
</style>
