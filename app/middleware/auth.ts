import { decodeJwt } from 'jose'

export default defineNuxtRouteMiddleware((to) => {
  const { token, logout } = useAuth()

  if (!token.value) {
    return navigateTo(`/login?redirect=${encodeURIComponent(to.fullPath)}`)
  }

  try {
    const payload = decodeJwt(token.value)
    if (typeof payload.exp === 'number' && payload.exp * 1000 <= Date.now()) {
      logout()
      return navigateTo(`/login?redirect=${encodeURIComponent(to.fullPath)}`)
    }
  } catch {
    logout()
    return navigateTo(`/login?redirect=${encodeURIComponent(to.fullPath)}`)
  }
})
