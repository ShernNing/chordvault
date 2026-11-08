import { useEffect, useSyncExternalStore } from 'react'

// Tiny shared signal: "a live-performance surface is on screen" (PerformBar,
// SetlistPerformer). App chrome that would collide with it on a phone — the
// floating back-to-top button — hides itself while this is true.

let count = 0
const listeners = new Set()

function emit() {
  if (typeof document !== 'undefined') {
    document.documentElement.toggleAttribute('data-perform-active', count > 0)
  }
  listeners.forEach((l) => l())
}

function subscribe(l) {
  listeners.add(l)
  return () => listeners.delete(l)
}

const getSnapshot = () => count > 0

/** Mark a performance surface as mounted while `active` is true. */
export function usePerformSurface(active = true) {
  useEffect(() => {
    if (!active) return undefined
    count++
    emit()
    return () => {
      count = Math.max(0, count - 1)
      emit()
    }
  }, [active])
}

/** True while any performance surface is mounted. */
export function usePerformActive() {
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}
