export default defineNuxtPlugin(() => {
  const { logout, authState } = useAuth()

  const api = $fetch.create({
    onResponseError({ response }) {
      if (response.status === 401 && import.meta.client) {
        const wasCustomer = authState.value.role === 'customer'
        logout()
        const path = window.location.pathname + window.location.search
        const loginPath = wasCustomer ? '/customer-login' : '/login'
        // 防重定向死循环：目标已是登录页（含 redirect 参数）则不附加 redirect
        const redirect = encodeURIComponent(path)
        const query = path.includes('redirect=') ? '' : `?redirect=${redirect}`
        navigateTo(`${loginPath}${query}`)
      }
    }
  })

  return { provide: { api } }
})
