<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'

const emit = defineEmits<{ close: [] }>()

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div class="help-overlay" @click.self="$emit('close')">
    <div class="help-modal" role="dialog" aria-modal="true" aria-labelledby="help-title">

      <!-- Header -->
      <div class="help-head">
        <span id="help-title" class="help-title">云水资源数据说明文档</span>
        <button class="help-close" @click="$emit('close')" aria-label="关闭">✕</button>
      </div>

      <!-- Body -->
      <div class="help-body">

        <section class="help-section">
          <h2 class="section-heading">摘要</h2>
          <p>大气水物质由水汽和大气水凝物（云水）组成，水汽通过热力动力过程凝结形成大气水凝物，大气水凝物通过云物理过程形成降水，降水主要来自大气水凝物，水汽-水凝物-降水的相互转化构成复杂的大气水物质循环过程。为满足人工影响天气对于开发对象资源了解的需要，提出云水资源和大气水资源的概念。定义一定区域、一定时段内，参与大气水循环全部过程，但未形成地面降水、仍留存在空中的大气水凝物总量（或大气水物质总量），称为云水资源（或大气水资源（Zhou et al.,2020）。为完整给出大气水物质循环过程各物理量定量值，进一步完善了大气水物质循环各物理量概念及计算式。包括：状态量是指某时刻可以观测到的瞬时量，平流量指一定时段内沿区域边界流入/流出的物理量；源汇量指一定时段内水汽和水凝物发生相态变化产生的地表蒸发、地面降水、云凝结和云蒸发量。按照质量守恒，在大气水物质循环过程中，对于一定区域和时段，输入项（包括：状态初值、输入和源）之和等于支出项（包括：状态终值、输出和汇）之和，定义为一定区域时段参与大气水循环全部过程的总量。降水与总量的比值定义为降水效率，包括：水汽降水效率、水凝物降水效率和总水物质降水效率，云凝结量与水汽总量的比例定义为水汽凝结效率。一定区域时段内的水物质平均状态量与降水强度的比值定义为更新期，包括：水汽更新期和水凝物更新期。</p>
        </section>

        <section class="help-section">
          <p>基于大气水物质循环完整过程和云水资源概念及定量评估理论，在以往主要关注水汽和降水的常规大气水循环基础上，增加云水循环过程，形成完整的大气水物质循环的评估。采用CLOUDSAT/CALIPSO卫星云观测、NCEP/NCAR大气再分析资料及全球降水气候数据集(GPCP)降水产品，结合飞机云物理探测，通过云水资源观测诊断评估系统 (CWR-DQ)，构建了不同分辨率不同时段的大气水物质循环特征量及云水资源评估数据集。本平台使用数据源为2000–2025年云水资源观测诊断评估数据集，以下为平台中变量的物理意义说明表。</p>
        </section>

        <section class="help-section">
          <h2 class="section-heading">表1　变量物理意义说明表</h2>
          <div class="table-wrap">
            <table class="var-table">
              <thead>
                <tr>
                  <th>物理量名称</th>
                  <th>符号</th>
                  <th>物理意义</th>
                </tr>
              </thead>
              <tbody>
                <tr><td>水汽平均状态量</td><td>MM<sub>v</sub></td><td>T时段内，研究区域中的水汽状态量的平均值，单位：kg</td></tr>
                <tr><td>水凝物平均状态量</td><td>MM<sub>h</sub></td><td>T时段内，研究区域中的水凝物状态量的平均值，单位：kg</td></tr>
                <tr><td>水汽输入值</td><td>Q<sub>vi</sub></td><td>T时段内，研究区域边界上水平流入的水汽总量，单位：kg</td></tr>
                <tr><td>水汽输出值</td><td>Q<sub>vo</sub></td><td>T时段内，研究区域边界上水平流出的水汽总量，单位：kg</td></tr>
                <tr><td>水凝物输入值</td><td>Q<sub>hi</sub></td><td>T时段内，研究区域边界上水平流入的水凝物总量，单位：kg</td></tr>
                <tr><td>水凝物输出值</td><td>Q<sub>ho</sub></td><td>T时段内，研究区域边界上水平流出的水凝物总量，单位：kg</td></tr>
                <tr><td>云凝结</td><td>C<sub>vh</sub></td><td>T时段内，研究区域中，水汽通过凝结（含凝华）过程发生相态转化成为水凝物的质量，单位为：kg</td></tr>
                <tr><td>地面降水</td><td>P<sub>s</sub></td><td>T时段内，研究区域中的累计降水量，单位：kg</td></tr>
                <tr><td>水汽总量</td><td>GM<sub>v</sub></td><td>T时段内，参与研究区域大气水循环过程的所有水汽收入项，单位：kg</td></tr>
                <tr><td>水凝物总量</td><td>GM<sub>h</sub></td><td>T时段内，参与研究区域大气水循环过程的所有水凝物收入项，单位：kg</td></tr>
                <tr><td>水凝物降水效率</td><td>PE<sub>h</sub></td><td>降水量与水凝物总量的比值，单位：%</td></tr>
                <tr><td>水汽凝结效率</td><td>CE<sub>v</sub></td><td>水汽发生相态转化形成大气水凝物的效率，单位：%</td></tr>
                <tr><td>水汽更新期</td><td>RT<sub>v</sub></td><td>T时段内，研究区域中水汽状态量的平均值和平均降水强度的比值，反映了一定时段内大气水汽循环情况。单位：hour</td></tr>
                <tr><td>水凝物更新期</td><td>RT<sub>h</sub></td><td>T时段内，研究区域中水凝物状态量的平均值和平均降水强度的比值，反映了一定时段内大气水凝物循环情况。单位：day</td></tr>
                <tr><td>云水资源量</td><td>CWR</td><td>T时段内，参与研究区域大气水物质循环过程，仍留存在空中的大气水凝物总量，单位：kg</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        <section class="help-section">
          <h2 class="section-heading">参考文献</h2>
          <ol class="ref-list">
            <li>Zhou, Y. Q., M. Cai, C. Tan, et al., Quantifying the cloud water resource: Basic concepts and characteristics[J]. <em>Journal of Meteorological Research</em>, 2020, 34(6), 1242–1255.</li>
            <li>Cai, M., Y. Q. Zhou, J. Z. Liu, et al., Quantifying the cloud water resource: Methods based on observational diagnosis and cloud model simulation[J]. <em>Journal of Meteorological Research</em>, 2020, 34(6), 1256–1270.</li>
            <li>Cai, M., Y. Q. Zhou, J. Z. Liu, et al., Diagnostic quantification on the cloud water resource of China during 2000–2019[J]. <em>Journal of Meteorological Research</em>, 2022, 36(2): 1–19.</li>
          </ol>
        </section>

      </div>

      <!-- Footer -->
      <div class="help-foot">
        <span class="contact-label">联系我们</span>
        <a href="mailto:share@byweather.cn" class="contact-email">share@byweather.cn</a>
      </div>

    </div>
  </div>
</template>

<style scoped>
.help-overlay {
  position: fixed;
  inset: 0;
  background: rgba(7, 9, 12, 0.6);
  backdrop-filter: blur(2px);
  z-index: 1500;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}

.help-modal {
  width: 100%;
  max-width: 760px;
  max-height: 85vh;
  background: var(--bg-1);
  border: 1px solid var(--line-2);
  display: flex;
  flex-direction: column;
}

/* ── Header ── */
.help-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.875em 1.25em;
  border-bottom: 1px solid var(--line-2);
  background: var(--bg-2);
  flex-shrink: 0;
}

.help-title {
  font-family: var(--font-mono);
  font-size: 0.6875rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--fg-1);
}

.help-close {
  background: none;
  border: none;
  color: var(--fg-3);
  cursor: pointer;
  font-size: 0.75rem;
  padding: 0.125em 0.375em;
  line-height: 1;
}
.help-close:hover { color: var(--fg-0); }

/* ── Body ── */
.help-body {
  flex: 1;
  overflow-y: auto;
  padding: 1.5em 1.75em;
  display: flex;
  flex-direction: column;
  gap: 1.5em;
}

.help-section {
  display: flex;
  flex-direction: column;
  gap: 0.75em;
}

.section-heading {
  font-family: var(--font-mono);
  font-size: 0.625rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--fg-3);
  margin: 0;
  font-weight: 400;
}

.help-body p {
  font-size: 0.8125rem;
  color: var(--fg-2);
  line-height: 1.8;
  margin: 0;
}

/* ── Table ── */
.table-wrap {
  overflow-x: auto;
}

.var-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.75rem;
}

.var-table th,
.var-table td {
  padding: 0.5em 0.75em;
  border: 1px solid var(--line-2);
  text-align: left;
  vertical-align: middle;
  color: var(--fg-2);
  line-height: 1.5;
}

.var-table th {
  background: var(--bg-2);
  color: var(--fg-1);
  font-family: var(--font-mono);
  font-size: 0.625rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  font-weight: 400;
  white-space: nowrap;
}

.var-table tr:nth-child(even) td { background: var(--bg-0); }
.var-table tr:hover td { background: var(--bg-3); color: var(--fg-0); }

.var-table td:first-child { white-space: nowrap; }
.var-table td:nth-child(2) {
  white-space: nowrap;
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: var(--accent);
  text-align: center;
}

/* ── References ── */
.ref-list {
  margin: 0;
  padding-left: 1.25em;
  display: flex;
  flex-direction: column;
  gap: 0.5em;
}

.ref-list li {
  font-size: 0.75rem;
  color: var(--fg-3);
  line-height: 1.6;
}

/* ── Footer ── */
.help-foot {
  padding: 0.75em 1.25em;
  border-top: 1px solid var(--line-1);
  background: var(--bg-2);
  display: flex;
  align-items: center;
  gap: 0.75em;
  flex-shrink: 0;
}

.contact-label {
  font-family: var(--font-mono);
  font-size: 0.5625rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--fg-3);
}

.contact-email {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: var(--accent);
  text-decoration: none;
  letter-spacing: 0.02em;
}
.contact-email:hover { text-decoration: underline; }
</style>
