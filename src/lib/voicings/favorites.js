import { useCallback } from 'react'
import { useLocalStorage } from '../hooks'

const KEY = 'chordvault-voicing-favorites'

export function useFavorites() {
  const [ids, setIds] = useLocalStorage(KEY, [])

  const has = useCallback((id) => Array.isArray(ids) && ids.includes(id), [ids])
  const toggle = useCallback((id) => {
    setIds(prev => {
      const arr = Array.isArray(prev) ? prev : []
      return arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id]
    })
  }, [setIds])
  const clear = useCallback(() => setIds([]), [setIds])

  return { ids: Array.isArray(ids) ? ids : [], has, toggle, clear }
}
