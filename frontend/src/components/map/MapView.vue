<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useMap } from '@/composables/useMap'

const container = ref<HTMLDivElement>()
const { initMap, destroyMap } = useMap()

onMounted(() => {
  if (container.value) initMap(container.value)
})

onUnmounted(() => {
  destroyMap()
})
</script>

<template>
  <div ref="container" class="map-viewport" />
</template>

<style scoped>
.map-viewport {
  position: fixed;
  inset: 0;
  z-index: 0;
}
</style>
