import { useCallback, useEffect, useMemo, useState } from 'react'

export type FavoriteItem = {
  id: string
  site: 'wetaccess' | 'africancasting' | 'fanbusy'
  title: string
  thumb?: string
  url?: string
  meta?: string
  addedAt: number
}

const STORAGE_KEY = 'wetaccess:favorites'
const listeners = new Set<() => void>()

function readStore(): FavoriteItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as FavoriteItem[]) : []
  } catch {
    return []
  }
}

function writeStore(items: FavoriteItem[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  } catch { /* quota exceeded */ }
  for (const cb of listeners) cb()
}

export function useFavorites(site?: FavoriteItem['site']) {
  const [all, setAll] = useState<FavoriteItem[]>(readStore)

  useEffect(() => {
    const sync = () => setAll(readStore())
    listeners.add(sync)
    window.addEventListener('storage', sync)
    return () => {
      listeners.delete(sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  const items = useMemo(
    () => (site ? all.filter((f) => f.site === site) : all),
    [all, site],
  )

  const isFav = useCallback(
    (id: string) => all.some((f) => f.id === id),
    [all],
  )

  const toggle = useCallback(
    (item: Omit<FavoriteItem, 'addedAt'>) => {
      const current = readStore()
      const exists = current.findIndex((f) => f.id === item.id)
      if (exists >= 0) {
        current.splice(exists, 1)
      } else {
        current.unshift({ ...item, addedAt: Date.now() })
      }
      writeStore(current)
      setAll(current)
    },
    [],
  )

  const remove = useCallback((id: string) => {
    const current = readStore().filter((f) => f.id !== id)
    writeStore(current)
    setAll(current)
  }, [])

  const clear = useCallback((targetSite?: FavoriteItem['site']) => {
    const current = targetSite
      ? readStore().filter((f) => f.site !== targetSite)
      : []
    writeStore(current)
    setAll(current)
  }, [])

  return { items, all, isFav, toggle, remove, clear, count: items.length }
}
