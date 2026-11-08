import { useEffect } from 'react'

/**
 * Keep the screen awake while `active` is true (Screen Wake Lock API), so a
 * phone doesn't auto-lock mid-song. The browser drops the lock whenever the
 * page is hidden, so it's re-acquired when the page becomes visible again.
 * Silently no-ops where the API is unsupported or the request is refused
 * (low battery, insecure context, iframe policy…).
 */
export function useWakeLock(active) {
  useEffect(() => {
    if (!active) return undefined
    if (typeof navigator === 'undefined' || !navigator.wakeLock?.request) return undefined

    let sentinel = null
    let cancelled = false

    const acquire = async () => {
      if (cancelled || document.visibilityState !== 'visible') return
      if (sentinel && !sentinel.released) return
      try {
        const s = await navigator.wakeLock.request('screen')
        if (cancelled) { s.release().catch(() => {}); return }
        sentinel = s
      } catch {
        // Unsupported / denied — nothing useful to do.
      }
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible') acquire()
    }

    acquire()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibility)
      if (sentinel && !sentinel.released) sentinel.release().catch(() => {})
      sentinel = null
    }
  }, [active])
}
