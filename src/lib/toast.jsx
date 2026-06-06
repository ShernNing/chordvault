/* eslint-disable react-refresh/only-export-components */
// Lightweight toast system. Provider holds a stack; useToast() returns
// { success, error, info, dismiss }. Motion-animated, stage / reduced-motion safe.

import { createContext, useContext, useState, useCallback, useMemo, useRef } from 'react'
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react'
import { motion, AnimatePresence, useMotionEnabled, spring } from './motion'

const ToastContext = createContext(null)

const NOOP = { success: () => {}, error: () => {}, info: () => {}, dismiss: () => {} }

export function useToast() {
  return useContext(ToastContext) || NOOP
}

const TYPE_META = {
  success: { Icon: CheckCircle2, cls: 'text-green-500' },
  error: { Icon: AlertCircle, cls: 'text-red-500' },
  info: { Icon: Info, cls: 'text-[var(--color-accent)]' },
}

let counter = 0

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const [bursts, setBursts] = useState([])
  const timers = useRef({})

  const celebrate = useCallback(() => {
    const id = ++counter
    setBursts((b) => [...b, id])
    setTimeout(() => setBursts((b) => b.filter((x) => x !== id)), 1500)
  }, [])

  const dismiss = useCallback((id) => {
    setToasts((t) => t.filter((x) => x.id !== id))
    const timer = timers.current[id]
    if (timer) { clearTimeout(timer); delete timers.current[id] }
  }, [])

  const push = useCallback((message, opts = {}) => {
    const id = ++counter
    const duration = opts.duration ?? 3000
    setToasts((t) => [...t, { id, message, type: opts.type || 'info' }])
    if (duration > 0) timers.current[id] = setTimeout(() => dismiss(id), duration)
    return id
  }, [dismiss])

  const value = useMemo(() => ({
    success: (m, o) => push(m, { ...o, type: 'success' }),
    error: (m, o) => push(m, { ...o, type: 'error' }),
    info: (m, o) => push(m, { ...o, type: 'info' }),
    celebrate,
    dismiss,
  }), [push, celebrate, dismiss])

  return (
    <ToastContext.Provider value={value}>
      {children}
      {bursts.map((id) => <ConfettiBurst key={id} />)}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  )
}

const CONFETTI_COLORS = ['#F59E0B', '#FFD700', '#fcd34d', '#22c55e', '#0ea5e9', '#ec4899']

function ConfettiBurst() {
  const enabled = useMotionEnabled()
  const pieces = useMemo(
    () => Array.from({ length: 28 }, (_, i) => ({
      id: i,
      x: (Math.random() - 0.5) * 340,
      y: -(120 + Math.random() * 200),
      rot: Math.random() * 720 - 360,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      delay: Math.random() * 0.08,
      w: 6 + Math.random() * 6,
    })),
    [],
  )
  if (!enabled) return null
  return (
    <div className="fixed inset-x-0 top-24 z-[70] flex justify-center pointer-events-none no-print">
      <div className="relative">
        {pieces.map((p) => (
          <motion.span
            key={p.id}
            className="absolute block rounded-[1px]"
            style={{ width: p.w, height: p.w * 0.6, background: p.color }}
            initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
            animate={{ x: p.x, y: [0, p.y, p.y + 280], opacity: [1, 1, 0], rotate: p.rot }}
            transition={{ duration: 1.3, delay: p.delay, ease: 'easeOut', times: [0, 0.4, 1] }}
          />
        ))}
      </div>
    </div>
  )
}

function ToastViewport({ toasts, onDismiss }) {
  const enabled = useMotionEnabled()
  return (
    <div className="fixed bottom-6 right-6 z-[60] flex flex-col gap-2 pointer-events-none no-print">
      <AnimatePresence initial={false}>
        {toasts.map((t) => {
          const { Icon, cls } = TYPE_META[t.type] || TYPE_META.info
          return (
            <motion.div
              key={t.id}
              layout={enabled}
              initial={enabled ? { opacity: 0, x: 40, scale: 0.92 } : false}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={enabled ? { opacity: 0, x: 40, scale: 0.92 } : undefined}
              transition={spring}
              className="pointer-events-auto flex items-start gap-2.5 max-w-xs px-3.5 py-2.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] shadow-lg"
            >
              <Icon size={15} className={`${cls} mt-0.5 shrink-0`} />
              <span className="text-xs text-[var(--color-ink)] leading-snug flex-1">{t.message}</span>
              <button
                onClick={() => onDismiss(t.id)}
                className="text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] transition-colors shrink-0"
                aria-label="Dismiss"
              >
                <X size={13} />
              </button>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
