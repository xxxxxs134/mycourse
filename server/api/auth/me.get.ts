import { requireAuth } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const payload = await requireAuth(event)
  return { authenticated: true, role: payload.role, username: payload.username }
})
