<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRegionStore } from '@/stores/region'
import { YEAR_MIN, YEAR_MAX } from '@/config/constants'

const regionStore = useRegionStore()

const selectedYear = ref<number | 'all'>('all')
const error        = ref<string | null>(null)
const downloading  = ref(false)

const YEARS = ['all', ...Array.from({ length: YEAR_MAX - YEAR_MIN + 1 }, (_, i) => YEAR_MIN + i)]

onMounted(() => regionStore.loadRegions())

const regionName = computed(() => regionStore.selRegion?.name ?? '西藏自治区（全区）')

async function download() {
  error.value = null
  downloading.value = true
  try {
    const rid  = regionStore.selRegionId
    const gran = selectedYear.value === 'all' ? 'year' : 'year'
    const start = selectedYear.value === 'all' ? String(YEAR_MIN) : String(selectedYear.value)
    const end   = selectedYear.value === 'all' ? String(YEAR_MAX) : String(selectedYear.value)

    const base = import.meta.env.VITE_API_BASE ?? '/api/v1'
    const url  = `${base}/report/download?region_id=${rid}&granularity=${gran}&start=${start}&end=${end}`
    const res  = await fetch(url)
    if (res.status === 404) { error.value = '该组合暂无报告文件'; return }
    if (!res.ok) { error.value = `下载失败（HTTP ${res.status}）`; return }
    const blob = await res.blob()
    const a    = document.createElement('a')
    a.href     = URL.createObjectURL(blob)
    a.download = `${rid}_${gran}_${start}_${end}.docx`
    a.click()
    URL.revokeObjectURL(a.href)
  } catch {
    error.value = '网络错误，请重试'
  } finally {
    downloading.value = false
  }
}
</script>

<template>
  <div class="export-wrap">
    <div class="export-card">
      <div class="export-title">数据导出</div>

      <div class="form-row">
        <label class="form-label">区域</label>
        <select
          class="form-select"
          :value="regionStore.selRegionId"
          @change="regionStore.selectRegion(($event.target as HTMLSelectElement).value as any)"
        >
          <option value="xizang">西藏自治区（全区）</option>
          <optgroup label="地市">
            <option
              v-for="r in regionStore.regions.filter(r => r.level === 'prefecture')"
              :key="r.region_id"
              :value="r.region_id"
            >{{ r.name }}</option>
          </optgroup>
        </select>
      </div>

      <div class="form-row">
        <label class="form-label">年份</label>
        <select
          class="form-select"
          :value="selectedYear"
          @change="selectedYear = ($event.target as HTMLSelectElement).value === 'all' ? 'all' : Number(($event.target as HTMLSelectElement).value)"
        >
          <option value="all">全部</option>
          <option v-for="y in YEARS.slice(1)" :key="y" :value="y">{{ y }}</option>
        </select>
      </div>

      <button class="download-btn" :disabled="downloading" @click="download">
        {{ downloading ? '下载中…' : '⬇ 下载报告' }}
      </button>

      <div v-if="error" class="export-error">{{ error }}</div>

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
  padding: 40px 48px;
  width: 360px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.export-title {
  font-family: var(--font-mono);
  font-size: 13px;
  letter-spacing: 0.08em;
  color: var(--fg-1);
  text-transform: uppercase;
  margin-bottom: 4px;
}

.form-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.form-label {
  font-size: 12px;
  color: var(--fg-2);
  width: 40px;
  flex-shrink: 0;
}

.form-select {
  flex: 1;
  background: var(--bg-2);
  border: 1px solid var(--line-2);
  color: var(--fg-0);
  font-family: var(--font-ui);
  font-size: 12px;
  padding: 5px 8px;
  outline: none;
}
.form-select:focus { border-color: var(--accent-dim); }

.download-btn {
  height: 36px;
  background: var(--bg-2);
  border: 1px solid var(--accent-dim);
  color: var(--accent);
  font-size: 13px;
  cursor: pointer;
  letter-spacing: 0.04em;
  margin-top: 4px;
}
.download-btn:hover:not(:disabled) { background: var(--accent-faint); }
.download-btn:disabled { opacity: 0.5; cursor: default; }

.export-error {
  font-size: 11px;
  color: var(--warn);
  font-family: var(--font-mono);
}

.export-note {
  font-size: 11px;
  color: var(--fg-3);
  line-height: 1.6;
  border-top: 1px solid var(--line-1);
  padding-top: 12px;
}
</style>
