export default defineNuxtRouteMiddleware(async (to) => {
  const { isAdmin, checkAuth } = useAuth()

  if (isAdmin.value) return

  await checkAuth()
  if (!isAdmin.value) {
    return navigateTo(`/login?redirect=${encodeURIComponent(to.fullPath)}`)
  }
})
