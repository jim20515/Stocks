<script setup lang="ts">
import { h } from 'vue'
// 手機底部導覽列：4 個主入口 + 「更多」開啟側邊抽屜（其餘頁面走側欄）。桌機隱藏，仍用側欄。
const route = useRoute()
const emit = defineEmits(['menu'])

const icon = (d: string) => () => h('svg', { fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' }, [
  h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d }),
])

const items = [
  { path: '/', label: '總覽', icon: icon('M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z') },
  { path: '/stocks', label: '持股', icon: icon('M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z') },
  { path: '/allocation', label: '配置', icon: icon('M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z') },
  { path: '/backtest', label: '回測', match: '/backtest', icon: icon('M3 3v18h18M7 15l4-4 3 3 5-7') },
]

const isActive = (it: { path: string; match?: string }) =>
  it.match ? route.path.startsWith(it.match) : route.path === it.path
</script>

<template>
  <nav class="sm:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur border-t border-slate-200 safe-bottom">
    <div class="grid grid-cols-5 h-14">
      <NuxtLink v-for="it in items" :key="it.path" :to="it.path"
        class="flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors"
        :class="isActive(it) ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'">
        <component :is="it.icon" class="w-5 h-5" />
        {{ it.label }}
      </NuxtLink>
      <button type="button" @click="emit('menu')"
        class="flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium text-slate-400 hover:text-slate-600 transition-colors">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
        更多
      </button>
    </div>
  </nav>
</template>
