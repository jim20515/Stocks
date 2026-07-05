<script setup lang="ts">
const { authHeaders, user } = useAuth()
const { isAdmin } = useAdmin()

const { data, refresh, error } = await useAuthFetch<any>('/api/admin/users', { key: 'admin-users' })
const users = computed<any[]>(() => data.value?.users ?? [])

const busyId = ref('')
const errorMsg = ref('')

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
      <div class="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <h3 class="text-sm font-semibold text-slate-800">所有帳號</h3>
        <p class="text-xs text-slate-400">共 {{ users.length }} 個</p>
      </div>
      <p v-if="errorMsg" class="px-5 py-2 text-xs text-red-500">{{ errorMsg }}</p>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="bg-slate-50 border-b border-slate-100">
              <th class="text-left px-5 py-3 text-xs font-medium text-slate-500">Email</th>
              <th class="text-left px-4 py-3 text-xs font-medium text-slate-500">登入方式</th>
              <th class="text-left px-4 py-3 text-xs font-medium text-slate-500">註冊時間</th>
              <th class="text-left px-4 py-3 text-xs font-medium text-slate-500">最後登入</th>
              <th class="text-center px-4 py-3 text-xs font-medium text-slate-500">管理員</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-50">
            <tr v-for="u in users" :key="u.id" class="hover:bg-slate-50/50 transition">
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
    </div>
  </div>
</template>
