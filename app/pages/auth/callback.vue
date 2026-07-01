<script setup lang="ts">
definePageMeta({ layout: false })

const { setSession } = useAuth()
const errorMessage = ref('')
const loading = ref(true)

const supabaseSession = useSupabaseSession()

// plugin 會自動交換 code 並更新 supabaseSession
watch(supabaseSession, (session) => {
  if (session?.user) {
    setSession(session.access_token, {
      id: session.user.id,
      email: session.user.email ?? '',
    })
    window.location.replace('/')
  }
}, { immediate: true })

// 5 秒後還沒完成就顯示錯誤
onMounted(() => {
  setTimeout(() => {
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
