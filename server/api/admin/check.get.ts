// 目前登入者是否為管理員（給前端決定要不要顯示「帳號管理」）。訪客/未登入回 false，不報錯。
export default defineEventHandler(async (event) => {
  let userId: string | null = null
  try {
    userId = await requireUser(event)
  } catch {
    return { isAdmin: false }
  }
  return { isAdmin: await isUserAdmin(userId) }
})
