export default defineNuxtPlugin(() => {
  const { token, logout } = useAuth()

  const api = $fetch.create({
    onRequest({ options }) {
      if (token.value) {
        const headers = new Headers(options.headers)
        headers.set('Authorization', `Bearer ${token.value}`)
        options.headers = headers
      }
    },
    onResponseError({ response }) {
      if (response.status === 401) {
        logout()
        const redirect = encodeURIComponent(window.location.pathname + window.location.search)
        navigateTo(`/login?redirect=${redirect}`)
      }
    }
  })

  return { provide: { api } }
})
