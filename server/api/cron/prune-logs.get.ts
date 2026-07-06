// Vercel Cron：每天清除 90 天前的稽核紀錄，讓 activity_log 大小有上限。
export default defineEventHandler(async (event) => {
  const authHeader = getHeader(event, 'authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) throw createError({ statusCode: 500, message: 'CRON_SECRET not set' })
  if (authHeader !== `Bearer ${cronSecret}`) throw createError({ statusCode: 401, message: 'Unauthorized' })

  const client = useServiceDb()
  if (!client) throw createError({ statusCode: 500, message: 'NUXT_SUPABASE_SECRET_KEY not set' })

  const cutoff = new Date(Date.now() - 90 * 86400000).toISOString()
  const { error } = await client.from('activity_log').delete().lt('created_at', cutoff)
  if (error) throw createError({ statusCode: 500, message: error.message })

  return { pruned: true, olderThan: cutoff }
})
