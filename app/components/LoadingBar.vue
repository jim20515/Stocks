<script setup lang="ts">
const { isLoading, progress } = useLoadingIndicator()
</script>

<template>
  <div v-if="isLoading"
    class="fixed top-0 left-0 z-[9999] h-0.5 bg-indigo-500 transition-all duration-300 ease-out"
    :style="{ width: progress + '%' }" />
</template>
