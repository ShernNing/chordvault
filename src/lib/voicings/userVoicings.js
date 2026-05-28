import { useCallback } from 'react'
import { useLocalStorage } from '../hooks'
import { isMovable, voicingPosition } from './notes'

const KEY = 'chordvault-user-voicings'

// User-defined voicings stored in localStorage. Shape mirrors catalog records.
export function useUserVoicings() {
  const [list, setList] = useLocalStorage(KEY, [])

  const add = useCallback((entry) => {
    const id = entry.id || `user-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const record = normalize({ ...entry, id })
    setList(prev => [...(Array.isArray(prev) ? prev : []), record])
    return record
  }, [setList])

  const update = useCallback((id, patch) => {
    setList(prev => (Array.isArray(prev) ? prev : []).map(v => v.id === id ? normalize({ ...v, ...patch }) : v))
  }, [setList])

  const remove = useCallback((id) => {
    setList(prev => (Array.isArray(prev) ? prev : []).filter(v => v.id !== id))
  }, [setList])

  return {
    list: Array.isArray(list) ? list : [],
    add,
    update,
    remove,
  }
}

function normalize(entry) {
  const frets = (entry.frets || [null, null, null, null, null, null]).slice(0, 6)
  while (frets.length < 6) frets.push(null)
  return {
    id: entry.id,
    rootChord: entry.rootChord || 'C',
    displayName: entry.displayName || entry.rootChord || 'C',
    frets,
    sourceKey: entry.sourceKey || rootOf(entry.rootChord || 'C'),
    movable: isMovable(frets),
    position: voicingPosition(frets),
    shape: entry.shape || null,
    inversion: entry.inversion || null,
    tags: Array.from(new Set([...(entry.tags || []), 'custom'])),
    description: entry.description || '',
    isUser: true,
    createdAt: entry.createdAt || Date.now(),
  }
}

function rootOf(chord) {
  const m = chord.match(/^([A-G][b#]?)/)
  return m ? m[1] : 'C'
}
