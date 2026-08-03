export default defineEventHandler(async (event) => {
  deleteCookie(event, 'admin_token', { path: '/' })
  deleteCookie(event, 'customer_token', { path: '/' })
  return { ok: true }
})
