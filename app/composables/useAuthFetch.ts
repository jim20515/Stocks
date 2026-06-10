export function useAuthFetch<T>(url: string, opts: Omit<Parameters<typeof useFetch<T>>[1], 'headers' | 'watch'> = {}) {
  const { token, clearSession } = useAuth()
  return useFetch<T>(url, {
    ...(opts as any),
    headers: computed(() => token.value ? { Authorization: `Bearer ${token.value}` } : {}) as any,
    watch: [token],
    immediate: computed(() => !!token.value) as any,
    async onResponseError({ response }) {
      if (response.status === 401) {
        clearSession()
        await navigateTo('/login')
      }
    },
  })
}
