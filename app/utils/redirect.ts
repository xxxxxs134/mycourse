/** 站内安全重定向：只允许 / 开头的站内路径，拒绝 // 、/\ 、控制符、异常编码 */
export function safeRedirect(r: unknown, fallback: string): string {
  const s = String(r ?? '').trim()
  if (!s.startsWith('/')) return fallback
  if (/^[\/\\]{2}/.test(s)) return fallback
  if (s.startsWith('/%5C') || s.startsWith('/%2F')) return fallback
  if (/[\x00-\x1f]/.test(s)) return fallback
  return s
}
