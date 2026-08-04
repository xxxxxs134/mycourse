import { requireAuth } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store, private')
  const payload = await requireAuth(event)
  return { authenticated: true, role: payload.role, username: payload.username }
})
