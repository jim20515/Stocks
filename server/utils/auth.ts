import type { H3Event } from 'h3'
import { jwtVerify, createRemoteJWKSet } from 'jose'

const supabaseUrl = process.env.SUPABASE_URL!
// JWKS is cached in-memory by jose after first fetch
const JWKS = createRemoteJWKSet(new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`))

export function getBearerToken(event: H3Event): string | null {
  const auth = getHeader(event, 'authorization') ?? ''
  if (auth.startsWith('Bearer ')) return auth.slice(7)
  return null
}

export async function requireUser(event: H3Event): Promise<string> {
  const token = getBearerToken(event)
  if (!token) throw createError({ statusCode: 401, message: '未登入' })

  try {
    const { payload } = await jwtVerify(token, JWKS)
    const userId = payload.sub
    if (!userId) throw new Error('no sub')
    return userId
  } catch {
    throw createError({ statusCode: 401, message: '登入已過期，請重新登入' })
  }
}
