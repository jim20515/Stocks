
export default defineEventHandler(async (event) => {
  const client = useDb()
  const id = Number(getRouterParam(event, 'id'))
  if (!id || isNaN(id)) throw createError({ statusCode: 400, message: '無效的 ID' })

  const { error } = await client.from('stock_holdings').delete().eq('id', id)
  if (error) throw createError({ statusCode: 500, message: error.message })
  return { success: true }
})
