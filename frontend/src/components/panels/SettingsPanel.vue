<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useSettingsStore, FONT_SIZE_OPTIONS } from '@/stores/settings'
import { BASEMAP_LIST } from '@/config/basemaps'

defineEmits<{ close: [] }>()

const settings = useSettingsStore()

interface BuildInfo {
  version: string
  commit: string
  dirty: boolean
  branch: string
  build_time: string
}

const buildInfo = ref<BuildInfo | null>(null)

onMounted(async () => {
  try {
    const base = (import.meta.env.VITE_API_BASE as string | undefined) ?? '/api/v1'
    const res = await fetch(`${base}/version`)
    if (res.ok) {
      const body = await res.json()
      buildInfo.value = body.data as BuildInfo
    }
  } catch { /* 版本信息获取失败时静默处理 */ }
})

function fmtTime(iso: string): string {
  try { return new Date(iso).toLocaleString('zh-CN', { hour12: false }) }
  catch { return iso }
}
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

        <!-- Scale mode -->
        <div class="settings-section">
          <div class="section-label">格点量程</div>
          <div class="radio-group">
            <label class="radio-item" :class="{ active: settings.scaleMode === 'auto' }">
              <input type="radio" value="auto" :checked="settings.scaleMode === 'auto'" @change="settings.scaleMode = 'auto'" />
              自动（逐帧计算）
            </label>
            <label class="radio-item" :class="{ active: settings.scaleMode === 'preset' }">
              <input type="radio" value="preset" :checked="settings.scaleMode === 'preset'" @change="settings.scaleMode = 'preset'" />
              预设（统计推荐量程）
            </label>
          </div>
          <div class="section-hint">预设量程对逐年/逐月/月平均生效；季平均始终自动；用户手动输入优先级最高</div>
        </div>

        <!-- Font size -->
        <div class="settings-section">
          <div class="section-label">界面大小</div>
          <div class="radio-group">
            <label
              v-for="opt in FONT_SIZE_OPTIONS" :key="opt.value"
              class="radio-item"
              :class="{ active: settings.fontSize === opt.value }"
            >
              <input
                type="radio"
                :value="opt.value"
                :checked="settings.fontSize === opt.value"
                @change="settings.fontSize = opt.value"
              />
              {{ opt.label }}
            </label>
          </div>
        </div>
      </div>

      <div class="settings-foot">
        <div v-if="buildInfo" class="build-info">
          <span class="bi-version">{{ buildInfo.version }}</span>
          <span v-if="buildInfo.dirty" class="bi-dirty">未提交改动</span>
          <span class="bi-time">{{ fmtTime(buildInfo.build_time) }}</span>
        </div>
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
  width: 18.75rem;
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
  padding: 0.75em 1em;
  border-bottom: 1px solid var(--line-1);
  background: var(--bg-2);
}

.settings-title {
  font-family: var(--font-mono);
  font-size: 0.6875rem;
  letter-spacing: 0.08em;
  color: var(--fg-1);
  text-transform: uppercase;
}

.settings-close {
  background: none;
  border: none;
  color: var(--fg-3);
  cursor: pointer;
  font-size: 0.75rem;
  padding: 0.125em 0.375em;
}
.settings-close:hover { color: var(--fg-0); }

.settings-body {
  flex: 1;
  overflow-y: auto;
  padding: 1em;
  display: flex;
  flex-direction: column;
  gap: 1.25em;
}

.settings-section {}

.section-label {
  font-size: 0.625rem;
  letter-spacing: 0.08em;
  color: var(--fg-3);
  text-transform: uppercase;
  margin-bottom: 0.5em;
  font-family: var(--font-mono);
}

.radio-group {
  display: flex;
  flex-direction: column;
  gap: 0.125em;
}

.radio-item {
  display: flex;
  align-items: center;
  gap: 0.5em;
  padding: 0.375em 0.5em;
  font-size: 0.75rem;
  color: var(--fg-2);
  cursor: pointer;
  border: 1px solid transparent;
}
.radio-item input { accent-color: var(--accent); cursor: pointer; }

.section-hint {
  margin-top: 0.375em;
  font-size: 0.5625rem;
  color: var(--fg-3);
  line-height: 1.5;
}
.radio-item:hover { background: var(--bg-3); color: var(--fg-0); }
.radio-item.active { color: var(--fg-0); border-color: var(--line-2); background: var(--bg-2); }

.settings-foot {
  padding: 0.75em 1em 1em;
  border-top: 1px solid var(--line-1);
  display: flex;
  flex-direction: column;
  gap: 0.625em;
}

.build-info {
  display: flex;
  flex-direction: column;
  gap: 0.125em;
  padding: 0.375em 0;
  border-bottom: 1px solid var(--line-1);
}
.bi-version {
  font-family: var(--font-mono);
  font-size: 0.625rem;
  color: var(--fg-2);
  letter-spacing: 0.04em;
}
.bi-dirty {
  font-family: var(--font-mono);
  font-size: 0.5625rem;
  color: var(--warn);
}
.bi-time {
  font-family: var(--font-mono);
  font-size: 0.5625rem;
  color: var(--fg-3);
}

.reset-btn {
  width: 100%;
  padding: 0.5em;
  background: var(--bg-2);
  border: 1px solid var(--line-2);
  color: var(--fg-2);
  font-size: 0.75rem;
  cursor: pointer;
}
.reset-btn:hover { background: var(--bg-3); color: var(--warn); border-color: var(--warn); }
</style>
