<script setup lang="ts">
// 共用彈窗殼：手機從底部滑上（含拖曳握把、安全區），桌機置中淡入。
// 內容用預設插槽；可選 #header（或 title prop）與 #footer（固定在底部、可放動作按鈕）。
// 結構為 sticky header + 可捲動 body + sticky footer，適用簡單表單與含清單的複雜彈窗。
const props = withDefaults(defineProps<{
  modelValue: boolean
  title?: string
  maxWidth?: string
  persistent?: boolean
  bodyClass?: string
}>(), {
  maxWidth: 'max-w-lg',
  persistent: false,
  bodyClass: '',
})
const emit = defineEmits<{ 'update:modelValue': [boolean] }>()

function close() {
  if (props.persistent) return
  emit('update:modelValue', false)
}

// 開啟時鎖背景捲動；用計數器避免多個 sheet 疊開時提早解鎖
watch(() => props.modelValue, (open) => {
  if (open) lockScroll()
  else unlockScroll()
})
onBeforeUnmount(() => { if (props.modelValue) unlockScroll() })

// Esc 關閉（桌機鍵盤）
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.modelValue) close()
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<script lang="ts">
// 背景捲動鎖（模組層級共用計數器）
let lockCount = 0
let savedOverflow = ''
function lockScroll() {
  if (!import.meta.client) return
  if (lockCount === 0) {
    savedOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  }
  lockCount++
}
function unlockScroll() {
  if (!import.meta.client) return
  lockCount = Math.max(0, lockCount - 1)
  if (lockCount === 0) document.body.style.overflow = savedOverflow
}
</script>

<template>
  <Teleport to="body">
    <Transition name="sheet">
      <div v-if="modelValue"
        class="fixed inset-0 bg-black/40 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4"
        @click.self="close">
        <div
          class="sheet-panel bg-white rounded-t-2xl sm:rounded-2xl w-full shadow-xl flex flex-col max-h-[90vh] overflow-hidden safe-bottom"
          :class="maxWidth">
          <!-- 手機拖曳握把 -->
          <div class="sm:hidden pt-2.5 pb-1 flex justify-center shrink-0">
            <div class="w-10 h-1.5 rounded-full bg-slate-300" />
          </div>

          <!-- 標題列 -->
          <div v-if="title || $slots.header"
            class="flex items-center justify-between px-6 pt-3 pb-3 sm:pt-6 border-b border-slate-100 shrink-0">
            <slot name="header">
              <h2 class="text-base font-semibold text-slate-800">{{ title }}</h2>
            </slot>
            <button v-if="!persistent" @click="close"
              class="p-1.5 -mr-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <!-- 可捲動內容 -->
          <div class="flex-1 overflow-y-auto overscroll-contain" :class="bodyClass">
            <slot />
          </div>

          <!-- 固定動作列 -->
          <div v-if="$slots.footer" class="shrink-0 border-t border-slate-100">
            <slot name="footer" />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* 背景淡入 */
.sheet-enter-active, .sheet-leave-active { transition: opacity 0.25s ease; }
.sheet-enter-from, .sheet-leave-to { opacity: 0; }

/* 面板：桌機微幅縮放淡入 */
.sheet-enter-active .sheet-panel, .sheet-leave-active .sheet-panel {
  transition: transform 0.28s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.25s ease;
}
.sheet-enter-from .sheet-panel, .sheet-leave-to .sheet-panel {
  opacity: 0;
  transform: translateY(8px) scale(0.98);
}

/* 手機：由底部整片滑上 */
@media (max-width: 639px) {
  .sheet-enter-from .sheet-panel, .sheet-leave-to .sheet-panel {
    opacity: 1;
    transform: translateY(100%) scale(1);
  }
}
</style>
