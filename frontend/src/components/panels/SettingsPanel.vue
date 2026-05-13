<script setup lang="ts">
import { useSettingsStore } from '@/stores/settings'
import { BASEMAP_LIST } from '@/config/basemaps'

defineEmits<{ close: [] }>()

const settings = useSettingsStore()
</script>

<template>
  <div class="settings-overlay" @click.self="$emit('close')">
    <div class="settings-panel">
      <div class="settings-head">
        <span class="settings-title">设置</span>
        <button class="settings-close" @click="$emit('close')">✕</button>
      </div>

      <div class="settings-body">
        <!-- Basemap -->
        <div class="settings-section">
          <div class="section-label">底图</div>
          <div class="radio-group">
            <label
              v-for="bm in BASEMAP_LIST" :key="bm.id"
              class="radio-item"
              :class="{ active: settings.basemap === bm.id }"
            >
              <input
                type="radio"
                :value="bm.id"
                :checked="settings.basemap === bm.id"
                @change="settings.basemap = bm.id"
              />
              {{ bm.label }}
            </label>
          </div>
        </div>

        <!-- Legend position -->
        <div class="settings-section">
          <div class="section-label">图例位置</div>
          <div class="radio-group">
            <label class="radio-item" :class="{ active: settings.legendPosition === 'left' }">
              <input type="radio" value="left" :checked="settings.legendPosition === 'left'" @change="settings.legendPosition = 'left'" />
              左侧
            </label>
            <label class="radio-item" :class="{ active: settings.legendPosition === 'right' }">
              <input type="radio" value="right" :checked="settings.legendPosition === 'right'" @change="settings.legendPosition = 'right'" />
              右侧
            </label>
          </div>
        </div>
      </div>

      <div class="settings-foot">
        <button class="reset-btn" @click="settings.resetAll()">恢复默认值</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-overlay {
  position: fixed;
  inset: 0;
  background: rgba(7,9,12,0.5);
  backdrop-filter: blur(2px);
  z-index: 1500;
  display: flex;
  align-items: flex-start;
  justify-content: flex-end;
  padding-top: var(--h-nav);
}

.settings-panel {
  width: 300px;
  background: var(--bg-1);
  border-left: 1px solid var(--line-2);
  height: calc(100vh - var(--h-nav));
  display: flex;
  flex-direction: column;
}

.settings-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--line-1);
  background: var(--bg-2);
}

.settings-title {
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.08em;
  color: var(--fg-1);
  text-transform: uppercase;
}

.settings-close {
  background: none;
  border: none;
  color: var(--fg-3);
  cursor: pointer;
  font-size: 12px;
  padding: 2px 6px;
}
.settings-close:hover { color: var(--fg-0); }

.settings-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.settings-section {}

.section-label {
  font-size: 10px;
  letter-spacing: 0.08em;
  color: var(--fg-3);
  text-transform: uppercase;
  margin-bottom: 8px;
  font-family: var(--font-mono);
}

.radio-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.radio-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  font-size: 12px;
  color: var(--fg-2);
  cursor: pointer;
  border: 1px solid transparent;
}
.radio-item input { accent-color: var(--accent); cursor: pointer; }
.radio-item:hover { background: var(--bg-3); color: var(--fg-0); }
.radio-item.active { color: var(--fg-0); border-color: var(--line-2); background: var(--bg-2); }

.settings-foot {
  padding: 16px;
  border-top: 1px solid var(--line-1);
}

.reset-btn {
  width: 100%;
  height: 32px;
  background: var(--bg-2);
  border: 1px solid var(--line-2);
  color: var(--fg-2);
  font-size: 12px;
  cursor: pointer;
}
.reset-btn:hover { background: var(--bg-3); color: var(--warn); border-color: var(--warn); }
</style>
