<script setup lang="ts">
definePageMeta({ layout: false })

const supabase = useSupabaseClient()
const { setSession } = useAuth()
const errorMessage = ref('')
const loading = ref(true)

onMounted(() => {
  const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session) {
      subscription.unsubscribe()
      setSession(session.access_token, {
        id: session.user.id,
        email: session.user.email ?? '',
      })
      await navigateTo('/')
    }
  })

  // 5 秒後若還沒登入則顯示錯誤
  setTimeout(() => {
    subscription.unsubscribe()
    if (loading.value) {
      errorMessage.value = '登入逾時，請回登入頁重試'
      loading.value = false
    }
  }, 5000)
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
