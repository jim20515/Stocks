<script setup lang="ts">
import { h } from 'vue'

const route = useRoute()
const isActive = (path: string) => route.path === path

const props = defineProps<{ open?: boolean }>()
const emit = defineEmits(['close'])

const icon = (d: string) => () => h('svg', { fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' }, [
  h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d })
])

const navItems = [
  {
    path: '/',
    label: '總覽儀表板',
    icon: icon('M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z'),
  },
  {
    path: '/stocks',
    label: '持股管理',
    icon: icon('M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z'),
  },
  {
    path: '/allocation',
    label: '資產配置',
    icon: icon('M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z'),
  },
  {
    path: '/watermark',
    label: '水位分析',
    icon: icon('M13 7h8m0 0v8m0-8l-8 8-4-4-6 6'),
  },
  {
    path: '/lifegoal',
    label: '人生目標',
    icon: icon('M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z'),
  },
]
</script>

<template>
  <aside class="fixed left-0 top-0 h-full w-60 bg-white border-r border-slate-200 flex flex-col z-40 transition-transform duration-300"
    :class="props.open ? 'translate-x-0' : '-translate-x-full md:translate-x-0'">
    <div class="px-6 py-5 border-b border-slate-200">
      <div class="flex items-center gap-3">
        <div class="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
          <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
          </svg>
        </div>
        <div>
          <p class="text-sm font-semibold text-slate-800">股票看板</p>
          <p class="text-xs text-slate-400">Stock Dashboard</p>
        </div>
      </div>
    </div>

    <nav class="flex-1 px-3 py-4 overflow-y-auto">
      <p class="px-3 mb-2 text-xs font-medium text-slate-400 uppercase tracking-wider">主選單</p>
      <ul class="space-y-0.5">
        <li v-for="item in navItems" :key="item.path">
          <NuxtLink
            :to="item.path"
            class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors"
            :class="isActive(item.path)
              ? 'bg-indigo-50 text-indigo-600'
              : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'"
            @click="emit('close')"
          >
            <component :is="item.icon" class="w-5 h-5 shrink-0" />
            {{ item.label }}
          </NuxtLink>
        </li>
      </ul>
    </nav>

    <div class="px-4 py-4 border-t border-slate-200">
      <div class="flex items-center gap-3">
        <div class="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
          <span class="text-xs font-semibold text-indigo-600">我</span>
        </div>
        <div class="min-w-0">
          <p class="text-sm font-medium text-slate-800 truncate">個人帳戶</p>
          <p class="text-xs text-slate-400 truncate">投資組合管理</p>
        </div>
      </div>
    </div>
  </aside>
</template>
