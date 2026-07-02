import { describe, it, expect, vi, beforeAll } from 'vitest'

// auth.ts 在頂層就 reads process.env.SUPABASE_URL，
// 我們需要用 vi.hoisted 確保在模組載入前就設好環境變數
vi.hoisted(() => {
  process.env.SUPABASE_URL = 'https://test.supabase.co'
})

// h3 mock event
function mockEvent(headers: Record<string, string> = {}) {
  return {
    context: {},
    node: { req: { headers, socket: { remoteAddress: '127.0.0.1' } } },
  } as any
}

describe('getBearerToken', () => {
  let getBearerToken: typeof import('../server/utils/auth').getBearerToken

  beforeAll(async () => {
    const mod = await import('../server/utils/auth')
    getBearerToken = mod.getBearerToken
  })

  it('有 Bearer token 時回傳 token', () => {
    const event = mockEvent({ authorization: 'Bearer abc123' })
    expect(getBearerToken(event)).toBe('abc123')
  })

  it('有 Bearer 但 token 含點', () => {
    const event = mockEvent({ authorization: 'Bearer my.jwt.token' })
    expect(getBearerToken(event)).toBe('my.jwt.token')
  })

  it('沒有 authorization header 時回傳 null', () => {
    const event = mockEvent({})
    expect(getBearerToken(event)).toBeNull()
  })

  it('authorization 不以 Bearer 開頭時回傳 null', () => {
    const event = mockEvent({ authorization: 'Basic abc123' })
    expect(getBearerToken(event)).toBeNull()
  })

  it('authorization 為空字串時回傳 null', () => {
    const event = mockEvent({ authorization: '' })
    expect(getBearerToken(event)).toBeNull()
  })
})
