export default defineNuxtPlugin(() => {
  const { token, clearSession } = useAuth()

  // Intercept all useFetch / $fetch calls globally
  const nuxtApp = useNuxtApp()
  nuxtApp.hook('app:error', async (err: any) => {
    if (err?.statusCode === 401 || err?.status === 401) {
      clearSession()
      await navigateTo('/login')
    }
  })

  // Also intercept $fetch calls (used in non-useFetch contexts)
  globalThis.$fetch = $fetch.create({
    onRequest({ options }) {
      if (token.value) {
        options.headers = {
          ...((options.headers as Record<string, string>) ?? {}),
          Authorization: `Bearer ${token.value}`,
        }
      }
    },
    async onResponseError({ response }) {
      if (response.status === 401) {
        clearSession()
        await navigateTo('/login')
      }
    },
  }) as typeof $fetch

  const $authFetch = $fetch.create({
    onRequest({ options }) {
      if (token.value) {
        options.headers = {
          ...options.headers,
          Authorization: `Bearer ${token.value}`,
        }
      }
    },
    async onResponseError({ response }) {
      if (response.status === 401) {
        clearSession()
        await navigateTo('/login')
      }
    },
  })

  return { provide: { authFetch: $authFetch } }
})
