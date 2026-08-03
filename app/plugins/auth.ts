export default defineNuxtPlugin(() => {
  const { logout, authState } = useAuth()

  const api = $fetch.create({
    onResponseError({ response }) {
      if (response.status === 401 && import.meta.client) {
        const wasCustomer = authState.value.role === 'customer'
        logout()
        const redirect = encodeURIComponent(window.location.pathname + window.location.search)
        const loginPath = wasCustomer ? '/customer-login' : '/login'
        navigateTo(`${loginPath}?redirect=${redirect}`)
      }
    }
  })

  return { provide: { api } }
})
