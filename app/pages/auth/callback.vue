<script setup lang="ts">
definePageMeta({ layout: false })

const supabase = useSupabaseClient()
const { setSession } = useAuth()

onMounted(async () => {
  const url = new URL(window.location.href)
  const code = url.searchParams.get('code')

  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (data.session) {
      setSession(data.session.access_token, {
        id: data.session.user.id,
        email: data.session.user.email ?? '',
      })
      await navigateTo('/')
      return
    }
  }

  // fallback：嘗試從現有 session 取得
  const { data } = await supabase.auth.getSession()
  if (data.session) {
    setSession(data.session.access_token, {
      id: data.session.user.id,
      email: data.session.user.email ?? '',
    })
    await navigateTo('/')
  } else {
    await navigateTo('/login')
  }
})
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-slate-50">
    <p class="text-slate-400 text-sm">登入中…</p>
  </div>
</template>
