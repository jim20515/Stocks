import type { H3Event } from 'h3'

export function getBearerToken(event: H3Event): string | null {
  const auth = getHeader(event, 'authorization') ?? ''
  if (auth.startsWith('Bearer ')) return auth.slice(7)
  return null
}

export async function requireUser(event: H3Event): Promise<string> {
  const token = getBearerToken(event)
  if (!token) throw createError({ statusCode: 401, message: '未登入' })
  const client = useDb(token)
  const { data: { user }, error } = await client.auth.getUser()
  if (error || !user) throw createError({ statusCode: 401, message: '登入已過期，請重新登入' })
  return user.id
}
