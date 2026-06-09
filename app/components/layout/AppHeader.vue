<script setup lang="ts">
const route = useRoute()
const emit = defineEmits(['add', 'logout'])
const { user } = useAuth()

const titleMap: Record<string, string> = {
  '/':           '總覽儀表板',
  '/stocks':     '持股管理',
  '/allocation': '資產配置',
  '/watermark':  '水位分析',
  '/lifegoal':   '人生目標',
}

const pageTitle = computed(() => titleMap[route.path] ?? '股票看板')
const today = computed(() =>
  new Date().toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })
)
</script>

<template>
  <header class="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-6">
    <div>
      <h1 class="text-base font-semibold text-slate-800">{{ pageTitle }}</h1>
      <p class="text-xs text-slate-400">{{ today }}</p>
    </div>
    <div class="flex items-center gap-3">
      <button
        v-if="route.path === '/stocks'"
        @click="emit('add')"
        class="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
        </svg>
        新增持股
      </button>
      <div class="flex items-center gap-2 border-l border-slate-200 pl-3">
        <span class="text-xs text-slate-400 hidden sm:block">{{ user?.email }}</span>
        <button @click="emit('logout')"
          class="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
          title="登出">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
        </button>
      </div>
    </div>
  </header>
</template>
