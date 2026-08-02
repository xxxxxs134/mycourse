const TOKEN_KEY = 'admin_token'

export const useAuth = () => {
  const token = useState<string | null>('auth_token', () => null)
  const isLoggedIn = computed(() => !!token.value)

  function load() {
    if (import.meta.client) {
      token.value = localStorage.getItem(TOKEN_KEY)
    }
  }

  async function login(username: string, password: string) {
    const res = await $fetch<{ token: string }>('/api/auth/login', {
      method: 'POST',
      body: { username, password }
    })
    token.value = res.token
    if (import.meta.client) {
      localStorage.setItem(TOKEN_KEY, res.token)
    }
  }

  function logout() {
    token.value = null
    if (import.meta.client) {
      localStorage.removeItem(TOKEN_KEY)
    }
  }

  load()

  return { token, isLoggedIn, login, logout }
}
