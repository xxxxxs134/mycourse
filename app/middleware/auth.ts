export default defineNuxtRouteMiddleware((to) => {
  const { token } = useAuth()
  if (import.meta.client && !token.value) {
    return navigateTo(`/login?redirect=${encodeURIComponent(to.fullPath)}`)
  }
})
