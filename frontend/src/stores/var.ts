import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { VarName } from '@/types'
import { VARS, DEFAULT_VAR, VAR_TO_GROUP } from '@/config/vars'

export const useVarStore = defineStore('var', () => {
  const selVar = ref<VarName>(DEFAULT_VAR)

  // Threshold filter (session state — not persisted)
  const threshMin = ref<number | null>(null)
  const threshMax = ref<number | null>(null)

  // 实际渲染时使用的量程（当配置占位值不匹配数据时由 useGridLayer 自动更新）
  const renderRange = ref<{ vmin: number; vmax: number } | null>(null)

  const varMeta = computed(() => VARS[selVar.value])
  const varGroup = computed(() => VAR_TO_GROUP[selVar.value])

  function selectVar(name: VarName): void {
    selVar.value = name
    threshMin.value = null
    threshMax.value = null
    renderRange.value = null
  }

  function setRenderRange(vmin: number, vmax: number): void {
    renderRange.value = { vmin, vmax }
  }

  function setThresh(min: number | null, max: number | null): void {
    threshMin.value = min
    threshMax.value = max
  }

  function clearThresh(): void {
    threshMin.value = null
    threshMax.value = null
  }

  return {
    selVar,
    threshMin,
    threshMax,
    renderRange,
    varMeta,
    varGroup,
    selectVar,
    setThresh,
    clearThresh,
    setRenderRange,
  }
})
