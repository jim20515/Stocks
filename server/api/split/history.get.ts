import { listSplits } from '~~/server/utils/splitStorage'

export default defineEventHandler(async (event) => {
  const userId = await requireUser(event)
  const token = getBearerToken(event)
  const client = useDb(token)

  const list = await listSplits(client, userId)
  return { ok: true, list }
})
