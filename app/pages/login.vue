<script setup lang="ts">
definePageMeta({ layout: false })

const { isLoggedIn, setSession } = useAuth()
if (isLoggedIn.value) await navigateTo('/')

const { start: startBar, finish: finishBar } = useLoadingIndicator()

const tab = ref<'login' | 'register'>('login')
const email = ref('')
const password = ref('')
const loading = ref(false)
const error = ref('')
const successMsg = ref('')

async function submit() {
  error.value = ''
  successMsg.value = ''
  if (!email.value || !password.value) { error.value = '請填寫 Email 和密碼'; return }
  loading.value = true
  try {
    const endpoint = tab.value === 'login' ? '/api/auth/login' : '/api/auth/register'
    const data = await $fetch<any>(endpoint, {
      method: 'POST',
      body: { email: email.value, password: password.value },
    })
    if (data.requiresConfirmation) {
      successMsg.value = '註冊成功！請至信箱點擊確認連結後再登入。'
      tab.value = 'login'
      return
    }
    setSession(data.accessToken, data.user)
    startBar()
    await navigateTo('/')
  } catch (e: any) {
    error.value = e?.data?.message ?? (tab.value === 'login' ? '登入失敗，請再試一次' : '註冊失敗，請確認資料後再試')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <LoadingBar />
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

        <div v-if="successMsg" class="text-xs text-green-600 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
          {{ successMsg }}
        </div>

        <div v-if="error" class="text-xs text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {{ error }}
        </div>

        <button type="submit" :disabled="loading"
          class="w-full py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition">
          {{ loading ? '處理中…' : tab === 'login' ? '登入' : '建立帳號' }}
        </button>
      </form>

      <div class="mt-6 pt-5 border-t border-slate-100">
        <p class="text-xs text-slate-400 mb-2.5 text-center">需要幫助？</p>
        <div class="flex items-center justify-between gap-3">
          <!-- 操作手冊 -->
          <a href="/股票看板_操作手冊.docx" download
            class="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition">
            <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h4a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
            </svg>
            下載操作手冊
          </a>
          <!-- LINE 社群 -->
          <a href="https://ulvis.net/stocksline" target="_blank" rel="noopener"
            class="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-green-600 bg-green-50 hover:bg-green-100 rounded-lg transition">
            <svg class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63h2.386c.349 0 .63.285.63.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63.349 0 .631.285.631.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.281.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314"/>
            </svg>
            加入 LINE 社群
          </a>
        </div>
      </div>
    </div>
  </div>
</template>
