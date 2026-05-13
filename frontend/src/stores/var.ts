import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { VarName } from '@/types'
import { VARS, DEFAULT_VAR, VAR_TO_GROUP } from '@/config/vars'

export const useVarStore = defineStore('var', () => {
  const selVar = ref<VarName>(DEFAULT_VAR)

  // Threshold filter (session state — not persisted)
  const threshMin = ref<number | null>(null)
  const threshMax = ref<number | null>(null)

  const varMeta = computed(() => VARS[selVar.value])
  const varGroup = computed(() => VAR_TO_GROUP[selVar.value])

  function selectVar(name: VarName): void {
    selVar.value = name
    // Reset thresholds when switching var
    threshMin.value = null
    threshMax.value = null
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
    varMeta,
    varGroup,
    selectVar,
    setThresh,
    clearThresh,
  }
})
