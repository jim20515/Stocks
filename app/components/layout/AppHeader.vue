<script setup lang="ts">
const route = useRoute()
const emit = defineEmits(['add', 'import', 'logout', 'menu'])
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

const tooltip = ref<{ text: string; x: number; y: number } | null>(null)

function showTip(e: MouseEvent, text: string) {
  tooltip.value = { text, x: e.clientX, y: e.clientY + 20 }
}
function hideTip() { tooltip.value = null }
</script>

<template>
  <header class="bg-white border-b border-slate-200 px-4 md:px-6">
    <!-- 主列 -->
    <div class="h-14 flex items-center justify-between">
      <div class="flex items-center gap-3 min-w-0">
        <button @click="emit('menu')" class="md:hidden p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 transition shrink-0">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <div class="min-w-0">
          <h1 class="text-base font-semibold text-slate-800 truncate">{{ pageTitle }}</h1>
          <p class="text-xs text-slate-400 hidden sm:block">{{ today }}</p>
        </div>
      </div>
      <div class="flex items-center gap-1 shrink-0">
        <template v-if="route.path === '/stocks'">
          <!-- 手機版：只顯示 icon -->
          <button @click="emit('import')" title="匯入 XLS"
            class="sm:hidden p-2 rounded-lg text-slate-500 border border-slate-200 hover:bg-slate-50 transition">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
          </button>
          <button @click="emit('add')" title="新增交易"
            class="sm:hidden p-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
            </svg>
          </button>
          <!-- 桌面版：顯示文字 -->
          <button @click="emit('import')"
            @mouseenter="showTip($event, '目前支援富邦、國泰對帳單')"
            @mouseleave="hideTip"
            class="hidden sm:flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors">
            <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            匯入 XLS
          </button>
          <button @click="emit('add')"
            class="hidden sm:flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors">
            <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
            </svg>
            新增交易
          </button>
        </template>
        <div class="flex items-center gap-2 border-l border-slate-200 pl-2 sm:pl-3 ml-1">
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
    </div>
  </header>

  <Teleport to="body">
    <div v-if="tooltip"
      class="fixed z-[9999] pointer-events-none px-2.5 py-1.5 bg-slate-800 text-slate-100 text-xs rounded-lg shadow-lg whitespace-nowrap -translate-x-1/2"
      :style="{ left: tooltip.x + 'px', top: tooltip.y + 'px' }">
      {{ tooltip.text }}
    </div>
  </Teleport>
</template>
