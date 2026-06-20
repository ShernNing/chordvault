import { useEffect, useRef } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'

// Remembers the window scroll position per history entry so going *back*
// returns you to where you were, while navigating to a *new* page starts at
// the top. Keyed by `location.key` (unique per history entry), so the same
// path visited twice keeps independent positions.
//
// Restoring waits for the page to grow tall enough — content mounts after the
// route transition / lazy load, so we retry across a few frames until the
// saved offset is reachable.

const positions = new Map()

export default function ScrollRestoration() {
  const location = useLocation()
  const navType = useNavigationType() // 'POP' = back/forward, else PUSH/REPLACE
  const keyRef = useRef(location.key)

  // Let us drive scrolling; the browser's own restoration fights the retries.
  useEffect(() => {
    const prev = window.history.scrollRestoration
    try { window.history.scrollRestoration = 'manual' } catch {}
    return () => { try { window.history.scrollRestoration = prev } catch {} }
  }, [])

  // Continuously record the current entry's scroll position.
  useEffect(() => {
    keyRef.current = location.key
    const onScroll = () => { positions.set(keyRef.current, window.scrollY) }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [location.key])

  // On each navigation, restore (back/forward) or reset to top (new page).
  useEffect(() => {
    const target = navType === 'POP' ? (positions.get(location.key) ?? 0) : 0
    if (target === 0) { window.scrollTo(0, 0); return }

    let raf = 0
    let frames = 0
    const tick = () => {
      window.scrollTo(0, target)
      frames += 1
      const reached = Math.abs(window.scrollY - target) <= 2
      if (!reached && frames < 60) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [location.key, navType])

  return null
}
