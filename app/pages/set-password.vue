<script setup lang="ts">
definePageMeta({ layout: false })

const { token, user, setSession, isLoggedIn } = useAuth()
const supabase = useSupabaseClient()

// 必須先登入（點驗證信連結回來後才會到這頁）；未登入就回登入頁
if (!isLoggedIn.value) await navigateTo('/login')

const password = ref('')
const confirm = ref('')
const loading = ref(false)
const error = ref('')

async function submit() {
  if (loading.value) return
  error.value = ''
  if (password.value.length < 6) { error.value = '密碼至少需 6 個字元'; return }
  if (password.value !== confirm.value) { error.value = '兩次輸入的密碼不一致'; return }
  loading.value = true
  try {
    const { error: upErr } = await supabase.auth.updateUser({
      password: password.value,
      data: { password_set: true },
    })
    if (upErr) throw upErr
    // 清掉 needsPassword 旗標，之後才不會再被導回這頁
    const { data } = await supabase.auth.getSession()
    const accessToken = data.session?.access_token ?? token.value ?? ''
    setSession(accessToken, { id: user.value!.id, email: user.value!.email }, data.session?.refresh_token)
    window.location.replace('/')
  } catch (e: any) {
    error.value = e?.message || '設定密碼失敗，請再試一次'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-slate-50 flex items-center justify-center p-4">
    <div class="bg-white rounded-2xl shadow-xl w-full max-w-sm p-8">
      <div class="text-center mb-7">
        <div class="w-12 h-12 rounded-xl bg-indigo-600 flex items-center justify-center mx-auto mb-3">
          <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <h1 class="text-xl font-bold text-slate-800">設定你的密碼</h1>
        <p class="text-sm text-slate-400 mt-1">Email 已驗證，請設定登入密碼</p>
        <p v-if="user?.email" class="text-xs text-slate-400 mt-2">{{ user.email }}</p>
      </div>

      <form @submit.prevent="submit" class="space-y-4">
        <div>
          <label class="block text-xs font-medium text-slate-600 mb-1.5">新密碼</label>
          <input v-model="password" type="password" placeholder="至少 6 個字元" autocomplete="new-password"
            class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300" />
        </div>
        <div>
          <label class="block text-xs font-medium text-slate-600 mb-1.5">再次輸入密碼</label>
          <input v-model="confirm" type="password" placeholder="再輸入一次" autocomplete="new-password"
            class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300" />
        </div>

        <div v-if="error" class="text-xs text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {{ error }}
        </div>

        <button type="submit" :disabled="loading"
          class="w-full py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition">
          {{ loading ? '設定中…' : '完成設定，開始使用' }}
        </button>
      </form>
    </div>
  </div>
</template>
