<script setup lang="ts">
definePageMeta({ layout: false })

const supabase = useSupabaseClient()
const { setSession } = useAuth()
const errorMessage = ref('')
const loading = ref(true)

onMounted(async () => {
  function handleSession(session: any) {
    setSession(session.access_token, {
      id: session.user.id,
      email: session.user.email ?? '',
    })
    window.location.replace('/')
  }

  const url = new URL(window.location.href)
  const code = url.searchParams.get('code')

  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (data?.session) {
      handleSession(data.session)
      return
    }
    if (error) {
      errorMessage.value = error.message
      loading.value = false
      return
    }
  }

  // implicit flow fallback：從現有 session 取得
  const { data } = await supabase.auth.getSession()
  if (data.session) {
    handleSession(data.session)
  } else {
    errorMessage.value = '沒有取得登入 session，請回登入頁重試'
    loading.value = false
  }
})
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-slate-50">
    <div class="bg-white rounded-2xl border border-slate-200 shadow-sm w-full max-w-sm p-6 text-center">
      <p v-if="loading" class="text-slate-400 text-sm">登入中…</p>
      <template v-else>
        <p class="text-sm font-semibold text-slate-800">第三方登入失敗</p>
        <p class="mt-2 text-xs text-red-500 break-words">{{ errorMessage }}</p>
        <NuxtLink to="/login"
          class="mt-5 inline-flex items-center justify-center px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition">
          回登入頁
        </NuxtLink>
      </template>
    </div>
  </div>
</template>
