import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { GridMeta } from '@/types'

type LoadStatus = 'idle' | 'loading' | 'ready' | 'error'

export const useMetaStore = defineStore('meta', () => {
  const status  = ref<LoadStatus>('idle')
  const error   = ref<string | null>(null)
  const data    = ref<GridMeta | null>(null)

  const isReady = computed(() => status.value === 'ready')
  const grid    = computed(() => data.value?.grid ?? null)
  const vars    = computed(() => data.value?.vars ?? null)
  const timeline = computed(() => data.value?.timeline ?? null)

  async function init(): Promise<void> {
    if (status.value === 'ready' || status.value === 'loading') return
    status.value = 'loading'
    error.value  = null
    try {
      const base = import.meta.env.VITE_GRID_BASE ?? '/grid'
      const res  = await fetch(`${base}/meta.json`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      data.value   = (await res.json()) as GridMeta
      status.value = 'ready'
    } catch (e) {
      error.value  = e instanceof Error ? e.message : String(e)
      status.value = 'error'
    }
  }

  return { status, error, data, isReady, grid, vars, timeline, init }
})
