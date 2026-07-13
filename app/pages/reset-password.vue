<script setup lang="ts">
definePageMeta({ layout: false })

const { setSession } = useAuth()
const supabase = useSupabaseClient()
const supabaseSession = useSupabaseSession()

const password = ref('')
const confirm = ref('')
const loading = ref(false)
const error = ref('')
// 等待信件連結建立的復原 session（@nuxtjs/supabase 會自動交換）
const checking = ref(true)
const ready = computed(() => !!supabaseSession.value?.user)

watch(supabaseSession, (s) => { if (s?.user) checking.value = false }, { immediate: true })
onMounted(() => {
  setTimeout(() => { if (checking.value) checking.value = false }, 5000)
})

async function submit() {
  if (loading.value) return
  error.value = ''
  if (!ready.value) { error.value = '連結無效或已逾時，請回登入頁重新申請'; return }
  if (password.value.length < 6) { error.value = '密碼至少需 6 個字元'; return }
  if (password.value !== confirm.value) { error.value = '兩次輸入的密碼不一致'; return }
  loading.value = true
  try {
    const { error: upErr } = await supabase.auth.updateUser({
      password: password.value,
      data: { password_set: true },
    })
    if (upErr) throw upErr
    const { data } = await supabase.auth.getSession()
    const s = data.session
    if (s?.user) setSession(s.access_token, { id: s.user.id, email: s.user.email ?? '' }, s.refresh_token)
    window.location.replace('/')
  } catch (e: any) {
    error.value = e?.message || '重設密碼失敗，請再試一次'
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
        <h1 class="text-xl font-bold text-slate-800">重設密碼</h1>
        <p class="text-sm text-slate-400 mt-1">請設定新的登入密碼</p>
      </div>

      <p v-if="checking" class="text-center text-sm text-slate-400 py-4">驗證連結中…</p>

      <template v-else>
        <div v-if="!ready" class="text-center">
          <p class="text-sm text-red-500 mb-5">連結無效或已逾時，請回登入頁重新申請重設密碼。</p>
          <NuxtLink to="/login"
            class="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition">
            回登入頁
          </NuxtLink>
        </div>

        <form v-else @submit.prevent="submit" class="space-y-4">
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
            {{ loading ? '設定中…' : '確認重設密碼' }}
          </button>
        </form>
      </template>
    </div>
  </div>
</template>
