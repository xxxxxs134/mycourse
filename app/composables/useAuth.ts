const TOKEN_COOKIE = 'admin_token'
const TOKEN_MAX_AGE = 12 * 3600

export const useAuth = () => {
  const token = useCookie<string | null>(TOKEN_COOKIE, {
    maxAge: TOKEN_MAX_AGE,
    sameSite: 'lax',
    path: '/',
  })
  const isLoggedIn = computed(() => !!token.value)

  async function login(username: string, password: string) {
    const res = await $fetch<{ token: string }>('/api/auth/login', {
      method: 'POST',
      body: { username, password }
    })
    token.value = res.token
  }

  function logout() {
    token.value = null
  }

  return { token, isLoggedIn, login, logout }
}
