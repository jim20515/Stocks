<script setup lang="ts">
import { h } from 'vue'

const route = useRoute()
const isActive = (path: string) => route.path === path
const isGroupActive = (paths: string[]) => paths.some(path => route.path === path || route.path.startsWith(`${path}/`))
const expandedGroups = ref<Record<string, boolean>>({
  backtest: route.path.startsWith('/backtest'),
})

watch(() => route.path, (path) => {
  if (path.startsWith('/backtest')) expandedGroups.value.backtest = true
})

const props = defineProps<{ open?: boolean }>()
const emit = defineEmits(['close'])

const { isGuest } = useGuestGate()

const icon = (d: string) => () => h('svg', { fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' }, [
  h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d })
])

const navItems = [
  {
    path: '/',
    label: '總覽儀表板',
    personal: true,
    icon: icon('M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z'),
  },
  {
    path: '/stocks',
    label: '持股管理',
    personal: true,
    icon: icon('M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z'),
  },
  {
    path: '/daily',
    label: '每日漲幅',
    personal: true,
    icon: icon('M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z'),
  },
  {
    path: '/allocation',
    label: '資產配置',
    personal: true,
    icon: icon('M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z'),
  },
  {
    path: '/watermark',
    label: '水位分析',
    icon: icon('M13 7h8m0 0v8m0-8l-8 8-4-4-6 6'),
  },
  {
    key: 'backtest',
    label: '回測分析',
    icon: icon('M3 3v18h18M7 15l4-4 3 3 5-7'),
    children: [
      { path: '/backtest/history', label: '更新歷史數據', personal: true },
      { path: '/backtest', label: '回測分析' },
      { path: '/backtest/strategy', label: '策略回測' },
      { path: '/backtest/live', label: '策略實戰', personal: true },
    ],
  },
  {
    path: '/lifegoal',
    label: '人生目標',
    icon: icon('M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z'),
  },
  {
    path: '/accounts',
    label: '帳戶管理',
    personal: true,
    icon: icon('M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z'),
  },
]

// 小鎖頭（訪客在個人頁項目上顯示）
const lockIcon = icon('M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z')
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
      <ul class="space-y-0.5 leading-normal">
        <li v-for="item in navItems" :key="item.path ?? item.key">
          <template v-if="'children' in item">
            <button
              type="button"
              class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors"
              :class="isGroupActive(item.children.map(child => child.path))
                ? 'bg-indigo-50 text-indigo-600'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'"
              @click="expandedGroups[item.key] = !expandedGroups[item.key]"
            >
              <component :is="item.icon" class="w-5 h-5 shrink-0" />
              <span class="flex-1 text-left">{{ item.label }}</span>
              <svg class="w-4 h-4 transition-transform" :class="expandedGroups[item.key] ? 'rotate-180' : ''"
                fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            <div v-if="expandedGroups[item.key]" class="mt-1 ml-8 space-y-0.5">
              <NuxtLink
                v-for="child in item.children"
                :key="child.path"
                :to="child.path"
                class="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                :class="isActive(child.path)
                  ? 'bg-indigo-50 text-indigo-600'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'"
                @click="emit('close')"
              >
                <span class="flex-1">{{ child.label }}</span>
                <component v-if="isGuest && (child as any).personal" :is="lockIcon" class="w-3.5 h-3.5 text-slate-300 shrink-0" />
              </NuxtLink>
            </div>
          </template>
          <NuxtLink
            v-else
            :to="item.path"
            class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors"
            :class="isActive(item.path)
              ? 'bg-indigo-50 text-indigo-600'
              : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'"
            @click="emit('close')"
          >
            <component :is="item.icon" class="w-5 h-5 shrink-0" />
            <span class="flex-1">{{ item.label }}</span>
            <component v-if="isGuest && (item as any).personal" :is="lockIcon" class="w-3.5 h-3.5 text-slate-300 shrink-0" />
          </NuxtLink>
        </li>
      </ul>
    </nav>

    <div class="px-4 py-4 border-t border-slate-200">
      <NuxtLink v-if="isGuest" to="/login" @click="emit('close')"
        class="flex items-center gap-3 group">
        <div class="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
          <span class="text-xs font-semibold text-slate-500">訪</span>
        </div>
        <div class="min-w-0">
          <p class="text-sm font-medium text-slate-800 truncate group-hover:text-indigo-600 transition">訪客預覽</p>
          <p class="text-xs text-indigo-500 truncate">點我登入 / 註冊 →</p>
        </div>
      </NuxtLink>
      <div v-else class="flex items-center gap-3">
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
