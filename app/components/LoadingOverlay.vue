<script setup lang="ts">
// 全螢幕過場（登入中/導向中共用），預設文字「登入中…」
defineProps<{ label?: string }>()
</script>

<template>
  <div class="fixed inset-0 z-50 bg-slate-50 flex flex-col items-center justify-center gap-3">
    <svg class="w-8 h-8 text-indigo-600 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.37 0 0 5.37 0 12h4z" />
    </svg>
    <p class="text-sm text-slate-500">{{ label || '登入中…' }}</p>
  </div>
</template>
