<script setup lang="ts">
const { authHeaders, user } = useAuth()
const { isAdmin } = useAdmin()

const { data, refresh, error } = await useAuthFetch<any>('/api/admin/users', { key: 'admin-users' })
const users = computed<any[]>(() => data.value?.users ?? [])

const busyId = ref('')
const errorMsg = ref('')

// ── 搜尋 ──
const search = ref('')
const filteredUsers = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return users.value
  return users.value.filter(u =>
    (u.email ?? '').toLowerCase().includes(q) ||
    (u.providers ?? []).join(',').toLowerCase().includes(q),
  )
})

// ── 排序 ──
const sortKey = ref('lastSignInAt')
const sortDir = ref<'asc' | 'desc'>('desc')
function toggleSort(key: string) {
  if (sortKey.value === key) sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  else { sortKey.value = key; sortDir.value = 'asc' }
  currentPage.value = 1
}
function sortVal(u: any, key: string) {
  if (key === 'providers') return (u.providers ?? []).join(',')
  if (key === 'isAdmin') return u.isAdmin ? 1 : 0
  return u[key]
}
const sortedUsers = computed(() => {
  if (!sortKey.value) return filteredUsers.value
  return [...filteredUsers.value].sort((a, b) => {
    const av = sortVal(a, sortKey.value)
    const bv = sortVal(b, sortKey.value)
    if (av == null) return 1
    if (bv == null) return -1
    const cmp = typeof av === 'string' ? av.localeCompare(bv, 'zh-TW') : av - bv
    return sortDir.value === 'asc' ? cmp : -cmp
  })
})

// ── 分頁 ──
const pageSize = 10
const currentPage = ref(1)
const totalPages = computed(() => Math.max(1, Math.ceil(sortedUsers.value.length / pageSize)))
const pagedUsers = computed(() => {
  const start = (currentPage.value - 1) * pageSize
  return sortedUsers.value.slice(start, start + pageSize)
})
function goPage(p: number) {
  if (p < 1 || p > totalPages.value) return
  currentPage.value = p
}
watch(search, () => { currentPage.value = 1 })

const sortIcon = (key: string) => sortKey.value === key ? (sortDir.value === 'asc' ? '↑' : '↓') : '↕'

async function toggleAdmin(u: any) {
  busyId.value = u.id
  errorMsg.value = ''
  try {
    await $fetch('/api/admin/users', {
      method: 'PATCH',
      headers: authHeaders.value as HeadersInit,
      body: { userId: u.id, isAdmin: !u.isAdmin },
    })
    await refresh()
  } catch (e: any) {
    errorMsg.value = e?.data?.message ?? '設定失敗'
  } finally {
    busyId.value = ''
  }
}

function fmtDate(s: string | null) {
  return s ? new Date(s).toLocaleString('zh-TW', { hour12: false }) : '—'
}
function providerLabel(p: string) {
  return p === 'email' ? '帳密' : p === 'google' ? 'Google' : p
}
</script>

<template>
  <div class="space-y-5">
    <div>
      <h2 class="text-lg font-bold text-slate-800">帳號管理</h2>
      <p class="text-xs text-slate-400 mt-0.5">所有註冊帳號一覽，可設定/取消管理員（僅管理員可見）</p>
    </div>

    <!-- 無權限 -->
    <div v-if="!isAdmin || error" class="bg-white rounded-xl border border-slate-200 p-10 text-center">
      <div class="w-11 h-11 mx-auto mb-3 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      </div>
      <p class="text-sm font-medium text-slate-700 mb-1">沒有存取權限</p>
      <p class="text-sm text-slate-400">此頁面僅限管理員檢視。</p>
    </div>

    <!-- 帳號列表 -->
    <div v-else class="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div class="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-100">
        <div class="relative">
          <svg class="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
          </svg>
          <input v-model="search" type="text" placeholder="搜尋 Email 或登入方式…"
            class="w-56 sm:w-72 pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300" />
        </div>
        <p class="text-xs text-slate-400 shrink-0">共 {{ sortedUsers.length }} 個</p>
      </div>
      <p v-if="errorMsg" class="px-5 py-2 text-xs text-red-500">{{ errorMsg }}</p>

      <div v-if="sortedUsers.length === 0" class="py-12 text-center text-sm text-slate-400">無符合的帳號</div>
      <div v-else class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="bg-slate-50 border-b border-slate-100">
              <th class="text-left px-5 py-3 text-xs font-medium text-slate-500 cursor-pointer select-none hover:text-indigo-600" @click="toggleSort('email')">
                Email <span class="ml-1 opacity-50">{{ sortIcon('email') }}</span>
              </th>
              <th class="text-left px-4 py-3 text-xs font-medium text-slate-500 cursor-pointer select-none hover:text-indigo-600" @click="toggleSort('providers')">
                登入方式 <span class="ml-1 opacity-50">{{ sortIcon('providers') }}</span>
              </th>
              <th class="text-left px-4 py-3 text-xs font-medium text-slate-500 cursor-pointer select-none hover:text-indigo-600" @click="toggleSort('createdAt')">
                註冊時間 <span class="ml-1 opacity-50">{{ sortIcon('createdAt') }}</span>
              </th>
              <th class="text-left px-4 py-3 text-xs font-medium text-slate-500 cursor-pointer select-none hover:text-indigo-600" @click="toggleSort('lastSignInAt')">
                最後登入 <span class="ml-1 opacity-50">{{ sortIcon('lastSignInAt') }}</span>
              </th>
              <th class="text-center px-4 py-3 text-xs font-medium text-slate-500 cursor-pointer select-none hover:text-indigo-600" @click="toggleSort('isAdmin')">
                管理員 <span class="ml-1 opacity-50">{{ sortIcon('isAdmin') }}</span>
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-50">
            <tr v-for="u in pagedUsers" :key="u.id" class="hover:bg-slate-50/50 transition">
              <td class="px-5 py-3.5 text-slate-700">
                {{ u.email }}
                <span v-if="u.id === user?.id" class="ml-1.5 text-xs text-indigo-400">（你）</span>
              </td>
              <td class="px-4 py-3.5">
                <span v-for="p in u.providers" :key="p"
                  class="inline-flex px-2 py-0.5 mr-1 rounded-full text-xs font-medium"
                  :class="p === 'google' ? 'bg-red-50 text-red-500' : 'bg-slate-100 text-slate-500'">
                  {{ providerLabel(p) }}
                </span>
              </td>
              <td class="px-4 py-3.5 text-slate-500 text-xs">{{ fmtDate(u.createdAt) }}</td>
              <td class="px-4 py-3.5 text-slate-500 text-xs">{{ fmtDate(u.lastSignInAt) }}</td>
              <td class="px-4 py-3.5 text-center">
                <span v-if="u.isAdmin" class="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-600 mr-2">管理員</span>
                <button
                  @click="toggleAdmin(u)"
                  :disabled="busyId === u.id || (u.id === user?.id && u.isAdmin)"
                  class="px-2.5 py-1 text-xs font-medium rounded-lg border transition disabled:opacity-40 disabled:cursor-not-allowed"
                  :class="u.isAdmin
                    ? 'text-slate-500 border-slate-200 hover:bg-slate-50'
                    : 'text-indigo-600 border-indigo-200 hover:bg-indigo-50'">
                  {{ busyId === u.id ? '處理中…' : u.isAdmin ? '取消管理員' : '設為管理員' }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 分頁 -->
      <div v-if="totalPages > 1" class="flex items-center justify-between px-5 py-3 border-t border-slate-100">
        <p class="text-xs text-slate-400">共 {{ sortedUsers.length }} 個，第 {{ currentPage }} / {{ totalPages }} 頁</p>
        <div class="flex items-center gap-1">
          <button @click="goPage(1)" :disabled="currentPage === 1"
            class="px-2 py-1 text-xs rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition">«</button>
          <button @click="goPage(currentPage - 1)" :disabled="currentPage === 1"
            class="px-2 py-1 text-xs rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition">‹</button>
          <template v-for="p in totalPages" :key="p">
            <button v-if="Math.abs(p - currentPage) <= 2 || p === 1 || p === totalPages"
              @click="goPage(p)"
              class="px-3 py-1 text-xs rounded-lg transition font-medium"
              :class="p === currentPage ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-100'">
              {{ p }}
            </button>
            <span v-else-if="Math.abs(p - currentPage) === 3" class="px-1 text-slate-300 text-xs">…</span>
          </template>
          <button @click="goPage(currentPage + 1)" :disabled="currentPage === totalPages"
            class="px-2 py-1 text-xs rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition">›</button>
          <button @click="goPage(totalPages)" :disabled="currentPage === totalPages"
            class="px-2 py-1 text-xs rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition">»</button>
        </div>
      </div>
    </div>
  </div>
</template>
