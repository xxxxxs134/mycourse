export default defineNuxtPlugin(() => {
  const { logout } = useAuth()

  const api = $fetch.create({
    onResponseError({ response }) {
      if (response.status === 401 && import.meta.client) {
        logout()
        const redirect = encodeURIComponent(window.location.pathname + window.location.search)
        navigateTo(`/login?redirect=${redirect}`)
      }
    }
  })

  return { provide: { api } }
})
