import { useEffect, useRef } from 'react'

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(',')

export function getFocusable(root) {
  if (!root) return []
  return [...root.querySelectorAll(FOCUSABLE)].filter(
    (el) => !el.closest('[inert]') && (el.getClientRects().length > 0 || el === document.activeElement),
  )
}

// Stack of open dialogs so only the top-most one reacts to Escape / Tab.
const stack = []

/**
 * Modal dialog keyboard behaviour: initial focus, Tab/Shift+Tab focus trap,
 * Escape to close, and focus restored to the opener on close.
 *
 *   const ref = useDialogA11y({ open, onClose })
 *   <div ref={ref} role="dialog" aria-modal="true" …>
 *
 * Options:
 *   open            boolean   — trap is active only while true (default true)
 *   onClose         () => void — called on Escape
 *   initialFocusRef ref       — element to focus first (else first focusable,
 *                               else the container itself)
 *   closeOnEscape   boolean   — default true
 */
export function useDialogA11y({ open = true, onClose, initialFocusRef, closeOnEscape = true } = {}) {
  const ref = useRef(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return undefined
    const token = {}
    stack.push(token)
    const opener = typeof document !== 'undefined' ? document.activeElement : null

    const focusInitial = () => {
      const root = ref.current
      if (!root || root.contains(document.activeElement)) return
      const target = initialFocusRef?.current || getFocusable(root)[0] || root
      if (target === root && !root.hasAttribute('tabindex')) root.setAttribute('tabindex', '-1')
      target.focus?.({ preventScroll: true })
    }
    // Let the dialog paint (and any enter animation mount) first.
    const raf = requestAnimationFrame(focusInitial)

    const onKey = (e) => {
      if (stack[stack.length - 1] !== token) return
      const root = ref.current
      if (!root) return
      if (e.key === 'Escape' && closeOnEscape) {
        e.stopPropagation()
        onCloseRef.current?.()
        return
      }
      if (e.key !== 'Tab') return
      const items = getFocusable(root)
      if (!items.length) {
        e.preventDefault()
        root.focus?.()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      if (e.shiftKey) {
        if (active === first || !root.contains(active)) {
          e.preventDefault()
          last.focus()
        }
      } else if (active === last || !root.contains(active)) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)

    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('keydown', onKey)
      const i = stack.indexOf(token)
      if (i >= 0) stack.splice(i, 1)
      // Restore focus to whatever opened the dialog, if it's still around.
      if (opener && opener.isConnected && typeof opener.focus === 'function') {
        opener.focus({ preventScroll: true })
      }
    }
  }, [open, closeOnEscape, initialFocusRef])

  return ref
}
