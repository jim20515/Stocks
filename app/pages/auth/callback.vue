<script setup lang="ts">
definePageMeta({ layout: false })

const supabase = useSupabaseClient()
const { setSession } = useAuth()
const errorMessage = ref('')
const loading = ref(true)

onMounted(async () => {
  // implicit flow：Supabase 會自動從 URL hash 解析 session
  const { data, error } = await supabase.auth.getSession()

  if (error) {
    errorMessage.value = error.message
    loading.value = false
    return
  }

  if (data.session) {
    setSession(data.session.access_token, {
      id: data.session.user.id,
      email: data.session.user.email ?? '',
    })
    await navigateTo('/')
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
