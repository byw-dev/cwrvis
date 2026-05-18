<script setup lang="ts">
import { ref, computed, watchEffect } from 'vue'
import { useMetaStore } from '@/stores/meta'
import { useSettingsStore } from '@/stores/settings'
import ProductNav from '@/components/layout/ProductNav.vue'
import BottomBar from '@/components/layout/BottomBar.vue'
import MapView from '@/components/map/MapView.vue'
import SubToolbar from '@/components/layout/SubToolbar.vue'
import LeftRail from '@/components/layout/LeftRail.vue'
import GridModule from '@/components/modules/GridModule.vue'
import RegionModule from '@/components/modules/RegionModule.vue'
import ExportModule from '@/components/modules/ExportModule.vue'
import SettingsPanel from '@/components/panels/SettingsPanel.vue'
import type { ModuleId } from '@/types'

const metaStore    = useMetaStore()
const settingsStore = useSettingsStore()
const activeModule = ref<ModuleId>('grid')
const settingsOpen = ref(false)

watchEffect(() => {
  document.documentElement.style.fontSize = settingsStore.fontSize
})

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

    <SubToolbar :active-module="activeModule" />

    <!-- 地图底层（grid / region 模块共享，v-show 保持实例存活）-->
    <MapView v-show="showMap" />

    <!-- 左侧变量轨道（仅 grid / region 模块显示） -->
    <LeftRail v-if="showMap" />

    <!-- 模块内容层 -->
    <GridModule   v-if="activeModule === 'grid'" />
    <RegionModule v-else-if="activeModule === 'region'" />
    <ExportModule v-else-if="activeModule === 'export'" />

    <BottomBar v-if="showBottomBar" />

    <SettingsPanel v-if="settingsOpen" @close="settingsOpen = false" />
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

</style>
