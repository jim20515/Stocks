<script setup lang="ts">
definePageMeta({ layout: false })

const supabase = useSupabaseClient()
const { setSession } = useAuth()

onMounted(() => {
  const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
    if (session) {
      subscription.unsubscribe()
      setSession(session.access_token, {
        id: session.user.id,
        email: session.user.email ?? '',
      })
      await navigateTo('/')
    } else if (event === 'SIGNED_OUT') {
      subscription.unsubscribe()
      await navigateTo('/login')
    }
  })

  // 若 3 秒內沒有 session 則導回登入頁
  setTimeout(async () => {
    subscription.unsubscribe()
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
  }, 3000)
})
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-slate-50">
    <p class="text-slate-400 text-sm">登入中…</p>
  </div>
</template>
