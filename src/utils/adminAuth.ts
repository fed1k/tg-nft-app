const SESSION_KEY = 'gf_admin_session_v1'
const VIA_KEY = 'gf_admin_via'

export type AdminVia = 'telegram' | 'staff' | 'desktop' | 'dev'

/** When true, any visitor can complete admin access (dev only — never in real production). */
export function isAdminDevBypass(): boolean {
  return import.meta.env.VITE_ADMIN_DEV_BYPASS === 'true'
}

/** Optional shared secret so operators can sign in outside Telegram (still store session client-side). */
export function getDesktopAdminSecret(): string | null {
  const s = import.meta.env.VITE_ADMIN_DESKTOP_SECRET?.trim()
  return s || null
}

export function isAdminSessionActive(): boolean {
  return sessionStorage.getItem(SESSION_KEY) === '1'
}

export function clearAdminSession(): void {
  sessionStorage.removeItem(SESSION_KEY)
  sessionStorage.removeItem(VIA_KEY)
  sessionStorage.removeItem('gf_admin_token')
}

/** Call after successful Telegram staff check, desktop passphrase, or dev verification. */
export function grantAdminSession(via: AdminVia): void {
  sessionStorage.setItem(SESSION_KEY, '1')
  sessionStorage.setItem(VIA_KEY, via)
  sessionStorage.setItem('gf_admin_token', crypto.randomUUID?.() ?? `${Date.now()}`)
}

export function getAdminSessionVia(): AdminVia | null {
  const v = sessionStorage.getItem(VIA_KEY)
  if (v === 'telegram' || v === 'staff' || v === 'desktop' || v === 'dev') return v
  return null
}

/** Profile / nav: dev bypass and desktop passphrase only; Telegram admins use API access-check. */
export function shouldShowAdminPortalEntry(): boolean {
  return isAdminDevBypass() || !!getDesktopAdminSecret()
}
