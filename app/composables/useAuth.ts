const TOKEN_COOKIE = 'admin_token'
const CUSTOMER_TOKEN_COOKIE = 'customer_token'
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
  useCookie<string | null>(CUSTOMER_TOKEN_COOKIE, {
    maxAge: TOKEN_MAX_AGE,
    sameSite: 'lax',
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
  })

  const authState = useState<{ authenticated: boolean, role?: string, username?: string }>('auth_state', () => ({ authenticated: false }))
  const isLoggedIn = computed(() => authState.value.authenticated)
  const isAdmin = computed(() => authState.value.authenticated && authState.value.role === 'admin')
  const isCustomer = computed(() => authState.value.authenticated && authState.value.role === 'customer')

  async function checkAuth(): Promise<boolean> {
    try {
      // SSR 时用 useRequestFetch 转发请求 cookie，否则服务端无法识别登录态
      const fetchFn = import.meta.server ? useRequestFetch() : $fetch
      const res = await fetchFn<{ authenticated: boolean, role: string, username: string }>('/api/auth/me')
      authState.value = { authenticated: true, role: res.role, username: res.username }
      return true
    } catch {
      authState.value = { authenticated: false }
      return false
    }
  }

  async function adminLogin(username: string, password: string) {
    const res = await $fetch<{ token: string }>('/api/auth/login', {
      method: 'POST',
      body: { username, password }
    })
    if (res.token) {
      authState.value = { authenticated: true, role: 'admin' }
    }
  }

  async function customerLogin(username: string, password: string) {
    const res = await $fetch<{ token: string, uid: number, username: string }>('/api/auth/customer-login', {
      method: 'POST',
      body: { username, password }
    })
    if (res.token) {
      authState.value = { authenticated: true, role: 'customer', username: res.username }
    }
  }

  async function register(username: string, password: string, nickname?: string) {
    const res = await $fetch<{ token: string, uid: number, username: string }>('/api/auth/register', {
      method: 'POST',
      body: { username, password, nickname }
    })
    if (res.token) {
      authState.value = { authenticated: true, role: 'customer', username: res.username }
    }
  }

  async function logout() {
    authState.value = { authenticated: false }
    await $fetch('/api/auth/logout', { method: 'POST' }).catch(() => {})
  }

  return { authState, isLoggedIn, isAdmin, isCustomer, login: adminLogin, customerLogin, register, logout, checkAuth }
}
