<script setup lang="ts">
definePageMeta({ layout: false })

const { isLoggedIn, setSession } = useAuth()
if (isLoggedIn.value) await navigateTo('/')

const tab = ref<'login' | 'register'>('login')
const email = ref('')
const password = ref('')
const loading = ref(false)
const error = ref('')

async function submit() {
  error.value = ''
  if (!email.value || !password.value) { error.value = '請填寫 Email 和密碼'; return }
  loading.value = true
  try {
    const endpoint = tab.value === 'login' ? '/api/auth/login' : '/api/auth/register'
    const data = await $fetch<any>(endpoint, {
      method: 'POST',
      body: { email: email.value, password: password.value },
    })
    setSession(data.accessToken, data.user)
    await navigateTo('/')
  } catch (e: any) {
    error.value = e?.data?.message ?? '登入失敗，請再試一次'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-slate-50 flex items-center justify-center p-4">
    <div class="bg-white rounded-2xl shadow-xl w-full max-w-sm p-8">
      <div class="text-center mb-8">
        <div class="w-12 h-12 rounded-xl bg-indigo-600 flex items-center justify-center mx-auto mb-3">
          <svg class="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
          </svg>
        </div>
        <h1 class="text-xl font-bold text-slate-800">股票看板</h1>
        <p class="text-sm text-slate-400 mt-1">個人投資組合管理</p>
      </div>

      <!-- Tab -->
      <div class="flex gap-1 bg-slate-100 rounded-lg p-1 mb-6">
        <button @click="tab = 'login'; error = ''"
          class="flex-1 py-1.5 text-sm font-medium rounded-md transition"
          :class="tab === 'login' ? 'bg-white shadow text-slate-800' : 'text-slate-500'">
          登入
        </button>
        <button @click="tab = 'register'; error = ''"
          class="flex-1 py-1.5 text-sm font-medium rounded-md transition"
          :class="tab === 'register' ? 'bg-white shadow text-slate-800' : 'text-slate-500'">
          註冊
        </button>
      </div>

      <form @submit.prevent="submit" class="space-y-4">
        <div>
          <label class="block text-xs font-medium text-slate-600 mb-1.5">Email</label>
          <input v-model="email" type="email" placeholder="your@email.com" autocomplete="email"
            class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300" />
        </div>
        <div>
          <label class="block text-xs font-medium text-slate-600 mb-1.5">密碼</label>
          <input v-model="password" type="password" placeholder="••••••••" autocomplete="current-password"
            class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300" />
        </div>

        <div v-if="error" class="text-xs text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {{ error }}
        </div>

        <button type="submit" :disabled="loading"
          class="w-full py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition">
          {{ loading ? '處理中…' : tab === 'login' ? '登入' : '建立帳號' }}
        </button>
      </form>
    </div>
  </div>
</template>
