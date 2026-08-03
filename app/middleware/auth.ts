export default defineNuxtRouteMiddleware(async (to) => {
  const { isLoggedIn, checkAuth } = useAuth()

  if (isLoggedIn.value) return

  await checkAuth()
  if (!isLoggedIn.value) {
    return navigateTo(`/login?redirect=${encodeURIComponent(to.fullPath)}`)
  }
})
