export default defineNuxtRouteMiddleware(async (to) => {
  const { isCustomer, checkAuth } = useAuth()

  if (isCustomer.value) return

  await checkAuth()
  if (!isCustomer.value) {
    return navigateTo(`/customer-login?redirect=${encodeURIComponent(to.fullPath)}`)
  }
})
