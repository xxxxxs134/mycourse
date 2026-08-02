export default defineNuxtPlugin(() => {
  const { token } = useAuth()

  const api = $fetch.create({
    onRequest({ options }) {
      if (token.value) {
        const headers = new Headers(options.headers)
        headers.set('Authorization', `Bearer ${token.value}`)
        options.headers = headers
      }
    }
  })

  return { provide: { api } }
})
