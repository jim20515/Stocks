<script setup lang="ts">
definePageMeta({ layout: false })

const { setSession } = useAuth()
const errorMessage = ref('')
const loading = ref(true)

onMounted(async () => {
  const url = new URL(window.location.href)
  const code = url.searchParams.get('code')

  if (!code) {
    errorMessage.value = '缺少授權碼，請重新登入'
    loading.value = false
    return
  }

  try {
    const data = await $fetch<any>(`/api/auth/google-callback?code=${code}`)
    setSession(data.accessToken, data.user)
    window.location.replace('/')
  } catch (e: any) {
    errorMessage.value = e?.data?.message ?? '登入失敗，請重試'
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
