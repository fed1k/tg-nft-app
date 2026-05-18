export const FAVORITES_CHANGED_EVENT = 'giftedforge-favorites-changed'

export type FavoriteEntry = {
  id: string
  title: string
  username: string
  price: string
  nft: string
  savedAt: number
}

export function favoritesStorageKey(telegramUserId?: number): string {
  const id = telegramUserId && telegramUserId > 0 ? String(telegramUserId) : 'guest'
  return `giftedforge_favorites_v1_${id}`
}

function parseStored(raw: string | null): Record<string, FavoriteEntry> {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as Record<string, FavoriteEntry>
  } catch {
    return {}
  }
}

export function readFavoritesMap(key: string): Record<string, FavoriteEntry> {
  if (typeof localStorage === 'undefined') return {}
  return parseStored(localStorage.getItem(key))
}

export function writeFavoritesMap(key: string, map: Record<string, FavoriteEntry>) {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(key, JSON.stringify(map))
}

export function notifyFavoritesChanged() {
  window.dispatchEvent(new CustomEvent(FAVORITES_CHANGED_EVENT))
}

export type FavoriteToggleMeta = Partial<Pick<FavoriteEntry, 'title' | 'username' | 'price' | 'nft'>>

/** @returns next state — true if now favorited */
export function toggleFavoriteInStorage(
  key: string,
  id: string,
  meta: FavoriteToggleMeta,
): boolean {
  const trimmed = String(id || '').trim()
  if (!trimmed) return false

  const cur = readFavoritesMap(key)
  if (cur[trimmed]) {
    delete cur[trimmed]
    writeFavoritesMap(key, cur)
    notifyFavoritesChanged()
    return false
  }

  cur[trimmed] = {
    id: trimmed,
    title: String(meta.title || 'NFT').slice(0, 200),
    username: String(meta.username || ''),
    price: String(meta.price || ''),
    nft: String(meta.nft || ''),
    savedAt: Date.now(),
  }
  writeFavoritesMap(key, cur)
  notifyFavoritesChanged()
  return true
}

export function isFavoriteStored(key: string, id: string): boolean {
  const trimmed = String(id || '').trim()
  if (!trimmed) return false
  return !!readFavoritesMap(key)[trimmed]
}

export function listFavoritesOrdered(key: string): FavoriteEntry[] {
  return Object.values(readFavoritesMap(key)).sort((a, b) => b.savedAt - a.savedAt)
}
