export default defineNuxtPlugin(() => {
  const { token, clearSession } = useAuth()

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
