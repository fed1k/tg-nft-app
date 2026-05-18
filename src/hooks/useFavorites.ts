import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  FAVORITES_CHANGED_EVENT,
  type FavoriteEntry,
  type FavoriteToggleMeta,
  favoritesStorageKey,
  listFavoritesOrdered,
  readFavoritesMap,
  toggleFavoriteInStorage,
} from '../utils/favoriteStorage'

export interface UseFavoritesResult {
  storageKey: string
  entries: FavoriteEntry[]
  isFavorite: (id: string) => boolean
  toggle: (id: string, meta?: FavoriteToggleMeta) => boolean
  count: number
}

export function useFavorites(telegramUserId?: number): UseFavoritesResult {
  const key = favoritesStorageKey(telegramUserId)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    const bump = () => setVersion((v) => v + 1)
    window.addEventListener(FAVORITES_CHANGED_EVENT, bump)
    return () => window.removeEventListener(FAVORITES_CHANGED_EVENT, bump)
  }, [])

  const entries = useMemo(() => listFavoritesOrdered(key), [key, version])
  const map = useMemo(() => readFavoritesMap(key), [key, version])

  const isFavorite = useCallback((id: string) => !!(id && map[String(id)]), [map])

  const toggle = useCallback(
    (id: string, meta?: FavoriteToggleMeta) => toggleFavoriteInStorage(key, String(id || ''), meta ?? {}),
    [key],
  )

  return { storageKey: key, entries, isFavorite, toggle, count: entries.length }
}
