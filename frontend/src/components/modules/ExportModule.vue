<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? '/api/v1'

// ── 报告元数据（启动时从 /report/meta 加载）────────────────────────────────

interface RegionMeta {
  name:      string
  level:     string
  years:     number[]
  has_multi: boolean
}

const metaLoading = ref(true)
const metaError   = ref<string | null>(null)
const reportMeta  = ref<Record<string, RegionMeta>>({})

onMounted(async () => {
  try {
    const res = await fetch(`${API_BASE}/report/meta`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = await res.json()
    reportMeta.value = json.data ?? {}
  } catch {
    metaError.value = '报告目录加载失败，请刷新重试'
  } finally {
    metaLoading.value = false
  }
})

// ── 区域列表：province 排前，prefecture 在后 ─────────────────────────────────

const regionList = computed(() =>
  Object.entries(reportMeta.value)
    .map(([id, m]) => ({ id, ...m }))
    .sort((a, b) => (a.level === 'province' ? -1 : 1) - (b.level === 'province' ? -1 : 1))
)

// ── 选择状态 ────────────────────────────────────────────────────────────────

const selRegionId = ref<string>('')
const selYear     = ref<string>('')

const selRegion = computed(() =>
  selRegionId.value ? reportMeta.value[selRegionId.value] ?? null : null
)

function onRegionChange(id: string) {
  selRegionId.value = id
  selYear.value     = ''
}

// ── 下载 ─────────────────────────────────────────────────────────────────────

const downloading = ref(false)
const dlError     = ref<string | null>(null)

const canDownload = computed(() => !!selRegionId.value && !!selYear.value && !downloading.value)

async function download() {
  if (!canDownload.value) return
  dlError.value     = null
  downloading.value = true
  try {
    const url = `${API_BASE}/report/download?region_id=${selRegionId.value}&year=${selYear.value}`
    const res = await fetch(url)
    if (res.status === 404) { dlError.value = '该组合暂无报告文件'; return }
    if (!res.ok)            { dlError.value = `下载失败（HTTP ${res.status}）`; return }
    const blob    = await res.blob()
    const cd      = res.headers.get('Content-Disposition') ?? ''
    const fnMatch = cd.match(/filename="?([^";]+)"?/)
    const a       = document.createElement('a')
    a.download    = fnMatch ? fnMatch[1] : `report-${selRegionId.value}-${selYear.value}.docx`
    a.href        = URL.createObjectURL(blob)
    a.click()
    URL.revokeObjectURL(a.href)
  } catch {
    dlError.value = '网络错误，请重试'
  } finally {
    downloading.value = false
  }
}
</script>

<template>
  <div class="export-wrap">
    <div class="export-card">
      <div class="export-title">报告制作</div>

      <div v-if="metaLoading" class="meta-state">加载报告目录…</div>
      <div v-else-if="metaError" class="meta-state error">{{ metaError }}</div>

      <template v-else>
        <div class="form-row">
          <label class="form-label">区域</label>
          <select
            class="form-select"
            :value="selRegionId"
            @change="onRegionChange(($event.target as HTMLSelectElement).value)"
          >
            <option value="" disabled>请选择区域</option>
            <option v-for="r in regionList" :key="r.id" :value="r.id">{{ r.name }}</option>
          </select>
        </div>

        <div class="form-row">
          <label class="form-label">年份</label>
          <select
            class="form-select"
            :value="selYear"
            :disabled="!selRegion"
            @change="selYear = ($event.target as HTMLSelectElement).value"
          >
            <option value="" disabled>{{ selRegion ? '请选择年份' : '—' }}</option>
            <option v-if="selRegion?.has_multi" value="multi">多年汇总</option>
            <option v-for="y in (selRegion?.years ?? [])" :key="y" :value="String(y)">{{ y }}</option>
          </select>
        </div>

        <button class="download-btn" :disabled="!canDownload" @click="download">
          {{ downloading ? '下载中…' : '⬇ 下载报告' }}
        </button>

        <div v-if="dlError" class="export-error">{{ dlError }}</div>
      </template>

      <div class="export-note">
        ℹ 报告为 .docx 格式，由数据团队预生成。<br>
        若所选组合暂无报告，将在此处提示"文件不存在"。
      </div>
    </div>
  </div>
</template>

<style scoped>
.export-wrap {
  position: fixed;
  inset: 0;
  top: calc(var(--h-nav) + var(--h-sub));
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.export-card {
  background: var(--bg-1);
  border: 1px solid var(--line-2);
  padding: 2.5em 3em;
  width: 22.5rem;
  display: flex;
  flex-direction: column;
  gap: 1em;
}

.export-title {
  font-family: var(--font-mono);
  font-size: 0.8125rem;
  letter-spacing: 0.08em;
  color: var(--fg-1);
  text-transform: uppercase;
  margin-bottom: 0.25em;
}

.meta-state {
  font-size: 0.75rem;
  color: var(--fg-3);
}
.meta-state.error { color: var(--warn); }

.form-row {
  display: flex;
  align-items: center;
  gap: 0.75em;
}

.form-label {
  font-size: 0.75rem;
  color: var(--fg-2);
  width: 2.5rem;
  flex-shrink: 0;
}

.form-select {
  flex: 1;
  background: var(--bg-2);
  border: 1px solid var(--line-2);
  color: var(--fg-0);
  font-family: var(--font-ui);
  font-size: 0.75rem;
  padding: 0.3125em 0.5em;
  outline: none;
}
.form-select:focus   { border-color: var(--accent-dim); }
.form-select:disabled { opacity: 0.45; cursor: default; }

.download-btn {
  padding: 0.5em;
  background: var(--bg-2);
  border: 1px solid var(--accent-dim);
  color: var(--accent);
  font-size: 0.8125rem;
  cursor: pointer;
  letter-spacing: 0.04em;
  margin-top: 0.25em;
}
.download-btn:hover:not(:disabled) { background: var(--accent-faint); }
.download-btn:disabled { opacity: 0.5; cursor: default; }

.export-error {
  font-size: 0.6875rem;
  color: var(--warn);
  font-family: var(--font-mono);
}

.export-note {
  font-size: 0.6875rem;
  color: var(--fg-3);
  line-height: 1.6;
  border-top: 1px solid var(--line-1);
  padding-top: 0.75em;
}
</style>
