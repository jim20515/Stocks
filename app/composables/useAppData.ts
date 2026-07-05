// 登入 → 走既有 useAuthFetch 取真資料；訪客 → 直接回傳固定 Demo（refresh 為 no-op）
// 回傳結構與 useAuthFetch 相容（{ data, refresh, pending, error }），頁面可原樣 destructure。
export function useAppData<T>(url: string, opts: any = {}, demo: T): any {
  const { isLoggedIn } = useAuth()
  if (isLoggedIn.value) return useAuthFetch<T>(url, opts)
  return {
    data: ref(demo),
    refresh: async () => {},
    pending: ref(false),
    error: ref(null),
    status: ref('success'),
  }
}
