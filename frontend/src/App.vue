<script setup lang="ts">
import { ref, computed } from 'vue'
import { useMetaStore } from '@/stores/meta'
import ProductNav from '@/components/layout/ProductNav.vue'
import BottomBar from '@/components/layout/BottomBar.vue'
import MapView from '@/components/map/MapView.vue'
import LeftRail from '@/components/layout/LeftRail.vue'
import PlaceholderModule from '@/components/modules/PlaceholderModule.vue'
import type { ModuleId } from '@/types'

const metaStore    = useMetaStore()
const activeModule = ref<ModuleId>('grid')
const settingsOpen = ref(false)

// BottomBar is only relevant for data-viewing modules
const showBottomBar = computed(() =>
  activeModule.value === 'grid' || activeModule.value === 'region'
)
const showMap = computed(() =>
  activeModule.value === 'grid' || activeModule.value === 'region'
)
</script>

<template>
  <!-- Loading gate: wait for meta.json before rendering UI -->
  <div v-if="!metaStore.isReady" class="loading-gate">
    <span v-if="metaStore.status === 'error'" class="err">
      元数据加载失败：{{ metaStore.error }}
    </span>
    <span v-else class="loading">正在加载…</span>
  </div>

  <template v-else>
    <ProductNav
      :active-module="activeModule"
      @update:active-module="activeModule = $event"
      @open-settings="settingsOpen = true"
    />

    <!-- 地图底层（grid / region 模块共享，v-show 保持实例存活）-->
    <MapView v-show="showMap" />

    <!-- 左侧变量轨道（仅 grid / region 模块显示） -->
    <LeftRail v-if="showMap" />

    <!-- 模块内容层（F-11/F-15 实现后替换占位） -->
    <PlaceholderModule v-if="!showMap" :module-id="activeModule" />

    <BottomBar v-if="showBottomBar" />

    <!-- F-18: SettingsPanel — placeholder until implemented -->
    <div v-if="settingsOpen" class="settings-backdrop" @click="settingsOpen = false">
      <div class="settings-stub" @click.stop>
        <p style="font-family: var(--font-mono); color: var(--fg-1);">设置面板（F-18，待实现）</p>
        <button @click="settingsOpen = false" style="color: var(--accent); background: none; border: none; cursor: pointer;">关闭</button>
      </div>
    </div>
  </template>
</template>

<style scoped>
.loading-gate {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-mono);
  font-size: 12px;
  letter-spacing: 0.1em;
}

.loading { color: var(--fg-3); }
.err     { color: var(--warn); }

.settings-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(7, 9, 12, 0.6);
  backdrop-filter: blur(4px);
  z-index: 1500;
  display: flex;
  align-items: center;
  justify-content: center;
}

.settings-stub {
  background: var(--bg-1);
  border: 1px solid var(--line-3);
  padding: 32px 48px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}
</style>
