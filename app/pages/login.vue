<script setup lang="ts">
definePageMeta({ layout: false })

const { isLoggedIn, setSession } = useAuth()
if (isLoggedIn.value) await navigateTo('/')

const { start: startBar } = useLoadingIndicator()
const supabase = useSupabaseClient()

const tab = ref<'login' | 'register'>('login')
const email = ref('')
const password = ref('')
const loading = ref(false)
const redirecting = ref(false)
const error = ref('')
const successMsg = ref('')

// 忘記密碼
const forgot = ref(false)
const forgotSent = ref(false)

function switchTab(next: 'login' | 'register') {
  tab.value = next
  forgot.value = false
  error.value = ''
  successMsg.value = ''
}

function openForgot() {
  forgot.value = true
  forgotSent.value = false
  error.value = ''
  successMsg.value = ''
}

async function sendReset() {
  if (loading.value) return
  error.value = ''
  if (!email.value) { error.value = '請填寫 Email'; return }
  loading.value = true
  try {
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.value, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    if (err) throw err
    forgotSent.value = true
  } catch (e: any) {
    error.value = e?.message || '寄送失敗，請稍後再試'
  } finally {
    loading.value = false
  }
}

async function loginWithGoogle() {
  redirecting.value = true
  const { error: oauthErr } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
      // 強制每次都顯示 Google 帳號選擇畫面，才能切換帳號
      queryParams: { prompt: 'select_account' },
    },
  })
  // 正常會直接跳轉到 Google；若這裡就出錯，收掉過場並顯示錯誤
  if (oauthErr) { redirecting.value = false; error.value = oauthErr.message }
}

async function submit() {
  if (loading.value) return
  error.value = ''
  successMsg.value = ''
  if (!email.value) { error.value = '請填寫 Email'; return }
  if (tab.value === 'login' && !password.value) { error.value = '請填寫密碼'; return }
  loading.value = true
  try {
    // 註冊：先由伺服器確認 email 未註冊（已註冊會丟 409），再「由前端」寄出驗證連結，
    // 這樣 PKCE 的 code verifier 才會留在本瀏覽器，點連結回來才能完成交換。
    if (tab.value === 'register') {
      await $fetch('/api/auth/register', { method: 'POST', body: { email: email.value } })
      const { error: otpErr } = await supabase.auth.signInWithOtp({
        email: email.value,
        options: {
          shouldCreateUser: true,
          data: { password_set: false },
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      })
      if (otpErr) throw otpErr
      successMsg.value = '註冊連結已寄出！請至信箱點擊連結完成驗證，並設定你的密碼。'
      return
    }
    const data = await $fetch<any>('/api/auth/login', {
      method: 'POST',
      body: { email: email.value, password: password.value },
    })
    setSession(data.accessToken, data.user, data.refreshToken)
    // 登入成功後導向儀表板，這段全頁重載會花幾秒，先蓋上「登入中…」畫面，
    // 避免按鈕恢復可按、看起來像沒反應
    redirecting.value = true
    window.location.replace('/')
  } catch (e: any) {
    const msg = e?.data?.message
    error.value = (typeof msg === 'string' && msg)
      ? msg
      : (tab.value === 'login' ? '登入失敗，請再試一次' : '無法寄出註冊連結，請稍後再試')
    // 已註冊 → 切回登入分頁，方便直接登入（保留錯誤訊息）
    if (tab.value === 'register' && (e?.data?.statusCode === 409 || e?.statusCode === 409)) {
      tab.value = 'login'
    }
  } finally {
    // 導向中不要恢復按鈕，讓「登入中…」畫面撐到頁面換掉為止
    if (!redirecting.value) loading.value = false
  }
}
</script>

<template>
  <LoadingBar />

  <!-- 登入成功/導向 Google 時的過場（避免看起來沒反應）-->
  <LoadingOverlay v-if="redirecting" />

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

      <!-- 登入 / 註冊 切換 -->
      <div v-if="!forgot" class="flex gap-1 bg-slate-100 rounded-lg p-1 mb-6">
        <button type="button" @click="switchTab('login')"
          class="flex-1 py-1.5 text-sm font-medium rounded-md transition"
          :class="tab === 'login' ? 'bg-white shadow text-slate-800' : 'text-slate-500'">
          登入
        </button>
        <button type="button" @click="switchTab('register')"
          class="flex-1 py-1.5 text-sm font-medium rounded-md transition"
          :class="tab === 'register' ? 'bg-white shadow text-slate-800' : 'text-slate-500'">
          註冊
        </button>
      </div>

      <!-- 登入 / 註冊 表單 -->
      <form v-if="!forgot" @submit.prevent="submit" class="space-y-4">
        <div>
          <label class="block text-xs font-medium text-slate-600 mb-1.5">Email</label>
          <input v-model="email" type="email" placeholder="your@email.com" autocomplete="email"
            class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300" />
        </div>
        <div v-if="tab === 'login'">
          <div class="flex items-center justify-between mb-1.5">
            <label class="block text-xs font-medium text-slate-600">密碼</label>
            <button type="button" @click="openForgot" class="text-xs text-indigo-500 hover:text-indigo-600">忘記密碼？</button>
          </div>
          <input v-model="password" type="password" placeholder="••••••••" autocomplete="current-password"
            class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300" />
        </div>

        <p v-if="tab === 'register'" class="text-xs text-slate-400 leading-relaxed">
          我們會寄一封驗證信到你的信箱，點擊信中連結即可完成註冊，並在第一次進入時設定密碼。
        </p>

        <div v-if="successMsg" class="text-xs text-green-600 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
          {{ successMsg }}
        </div>

        <div v-if="error" class="text-xs text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {{ error }}
        </div>

        <button type="submit" :disabled="loading"
          class="w-full py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition">
          {{ loading ? '處理中…' : tab === 'login' ? '登入' : '寄送註冊連結' }}
        </button>
      </form>

      <!-- 忘記密碼 -->
      <div v-else class="space-y-4">
        <p class="text-xs text-slate-400 leading-relaxed">
          輸入註冊時的 Email，我們會寄一封重設密碼的連結給你。
        </p>
        <div>
          <label class="block text-xs font-medium text-slate-600 mb-1.5">Email</label>
          <input v-model="email" type="email" placeholder="your@email.com" autocomplete="email"
            class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300" />
        </div>

        <div v-if="forgotSent" class="text-xs text-green-600 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
          若此 Email 有註冊，重設密碼的連結已寄出，請至信箱查收（含垃圾信匣）。
        </div>
        <div v-if="error" class="text-xs text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {{ error }}
        </div>

        <button type="button" @click="sendReset" :disabled="loading"
          class="w-full py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition">
          {{ loading ? '寄送中…' : '寄送重設連結' }}
        </button>
        <button type="button" @click="switchTab('login')"
          class="w-full py-2 text-sm font-medium text-slate-500 hover:text-indigo-600 transition">
          返回登入
        </button>
      </div>

      <div v-if="!forgot" class="mt-4">
        <button type="button" @click="loginWithGoogle"
          class="w-full flex items-center justify-center gap-2.5 py-2.5 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition">
          <svg class="w-4 h-4" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          使用 Google 登入
        </button>

        <div class="relative flex items-center justify-center my-4">
          <div class="absolute inset-0 flex items-center"><div class="w-full border-t border-slate-200"></div></div>
          <span class="relative bg-white px-3 text-xs text-slate-400">或</span>
        </div>

        <NuxtLink to="/"
          class="w-full flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium text-slate-500 hover:text-indigo-600 hover:bg-slate-50 rounded-lg transition">
          先不登入，直接看看
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
          </svg>
        </NuxtLink>
      </div>

      <div class="mt-6 pt-5 border-t border-slate-100">
        <p class="text-xs text-slate-400 mb-2.5 text-center">需要幫助？</p>
        <div class="flex items-center justify-between gap-3">
          <a href="/股票看板_操作手冊.docx" download
            class="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition">
            <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h4a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
            </svg>
            下載操作手冊
          </a>
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
