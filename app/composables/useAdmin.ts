// 目前登入者是否為管理員（給側邊欄/頁面判斷）。訪客回 false。
export function useAdmin() {
  const { data } = useAuthFetch<{ isAdmin: boolean }>('/api/admin/check', { key: 'admin-check' })
  const isAdmin = computed(() => !!data.value?.isAdmin)
  return { isAdmin }
}
