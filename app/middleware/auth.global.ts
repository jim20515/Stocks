function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    return payload.exp * 1000 < Date.now()
  } catch {
    return true
  }
}

export default defineNuxtRouteMiddleware((to) => {
  if (to.path === '/login') return
  const { token, clearSession } = useAuth()
  if (!token.value || isTokenExpired(token.value)) {
    clearSession()
    return navigateTo('/login')
  }
})
