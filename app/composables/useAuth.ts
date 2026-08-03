const TOKEN_COOKIE = 'admin_token'
const TOKEN_MAX_AGE = 12 * 3600

export const useAuth = () => {
  // httpOnly cookie：前端无法读值，仅用于随请求自动携带；登录态由 /api/auth/me 判定
  useCookie<string | null>(TOKEN_COOKIE, {
    maxAge: TOKEN_MAX_AGE,
    sameSite: 'lax',
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
  })

  const authState = useState<{ authenticated: boolean, role?: string }>('auth_state', () => ({ authenticated: false }))
  const isLoggedIn = computed(() => authState.value.authenticated)

  async function checkAuth(): Promise<boolean> {
    try {
      const res = await $fetch<{ authenticated: boolean, role: string, username: string }>('/api/auth/me')
      authState.value = { authenticated: true, role: res.role }
      return true
    } catch {
      authState.value = { authenticated: false }
      return false
    }
  }

  async function login(username: string, password: string) {
    const res = await $fetch<{ token: string }>('/api/auth/login', {
      method: 'POST',
      body: { username, password }
    })
    if (res.token) {
      authState.value = { authenticated: true }
    }
  }

  async function logout() {
    authState.value = { authenticated: false }
    await $fetch('/api/auth/logout', { method: 'POST' }).catch(() => {})
  }

  return { authState, isLoggedIn, login, logout, checkAuth }
}
