<script setup lang="ts">
// 全域 toast host：掛在 layout 一次即可，訊息由 useToast() 推入。
const toasts = useToasts()
const { dismiss } = useToast()
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed left-1/2 -translate-x-1/2 z-[100] flex flex-col items-center gap-2 pointer-events-none px-4 w-full max-w-sm
             bottom-[calc(env(safe-area-inset-bottom)+4.75rem)] sm:bottom-6">
      <TransitionGroup name="toast">
        <div v-for="t in toasts" :key="t.id"
          class="pointer-events-auto max-w-full px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2"
          :class="t.type === 'error' ? 'bg-red-500 text-white' : t.type === 'success' ? 'bg-slate-800 text-white' : 'bg-slate-800 text-white'"
          @click="dismiss(t.id)">
          <svg v-if="t.type === 'success'" class="w-4 h-4 shrink-0 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7" />
          </svg>
          <svg v-else-if="t.type === 'error'" class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12" />
          </svg>
          <span class="min-w-0">{{ t.message }}</span>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-enter-active, .toast-leave-active { transition: all 0.25s ease; }
.toast-enter-from { opacity: 0; transform: translateY(14px); }
.toast-leave-to { opacity: 0; transform: translateY(14px); }
.toast-move { transition: transform 0.25s ease; }
</style>
