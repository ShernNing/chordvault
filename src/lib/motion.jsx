/* eslint-disable react-refresh/only-export-components */
// Motion foundation for ChordVault.
// Every helper degrades to a plain, static element when motion is disabled —
// i.e. in stage mode (live performance, must stay dead-calm) or when the user
// has `prefers-reduced-motion`. Animations are intentionally subtle.

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence, useReducedMotion, animate } from 'framer-motion'

export { motion, AnimatePresence }

// ─── Presets ─────────────────────────────────────────────────────────────
export const spring = { type: 'spring', stiffness: 420, damping: 32 }
export const softSpring = { type: 'spring', stiffness: 260, damping: 26 }
export const ease = { duration: 0.28, ease: [0.22, 1, 0.36, 1] }

// ─── Gate ────────────────────────────────────────────────────────────────
// True when decorative motion should play. Reactive to stage-mode toggles
// (the `.stage-mode` class lives on <html>, flipped by useTheme).
export function useMotionEnabled() {
  const reduce = useReducedMotion()
  const [stage, setStage] = useState(
    () => typeof document !== 'undefined' && document.documentElement.classList.contains('stage-mode'),
  )
  useEffect(() => {
    const el = document.documentElement
    const update = () => setStage(el.classList.contains('stage-mode'))
    update()
    const obs = new MutationObserver(update)
    obs.observe(el, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])
  return !reduce && !stage
}

// ─── Reveal: fade + rise on mount ─────────────────────────────────────────
export function Reveal({ children, y = 8, delay = 0, className = '', ...props }) {
  const enabled = useMotionEnabled()
  if (!enabled) return <div className={className} {...props}>{children}</div>
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...ease, delay }}
      {...props}
    >
      {children}
    </motion.div>
  )
}

// ─── Stagger group + item ─────────────────────────────────────────────────
export const staggerItemVariants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: ease },
}

export function StaggerGroup({ children, className = '', stagger = 0.04, delayChildren = 0, ...props }) {
  const enabled = useMotionEnabled()
  if (!enabled) return <div className={className} {...props}>{children}</div>
  return (
    <motion.div
      className={className}
      initial="hidden"
      animate="show"
      variants={{ show: { transition: { staggerChildren: stagger, delayChildren } } }}
      {...props}
    >
      {children}
    </motion.div>
  )
}

export function StaggerItem({ children, className = '', ...props }) {
  const enabled = useMotionEnabled()
  if (!enabled) return <div className={className} {...props}>{children}</div>
  return (
    <motion.div className={className} variants={staggerItemVariants} {...props}>
      {children}
    </motion.div>
  )
}

// ─── AnimatedNumber: count up to value ────────────────────────────────────
export function AnimatedNumber({ value, className = '', format = (n) => Math.round(n), duration = 0.6 }) {
  const enabled = useMotionEnabled()
  const [display, setDisplay] = useState(value)
  const prev = useRef(value)
  useEffect(() => {
    if (!enabled) { prev.current = value; setDisplay(value); return }
    const controls = animate(prev.current, value, {
      duration, ease: 'easeOut', onUpdate: setDisplay,
    })
    prev.current = value
    return () => controls.stop()
  }, [value, enabled, duration])
  return <span className={className}>{format(display)}</span>
}

// ─── RollValue: vertical roll when a small value changes ──────────────────
// Used for transpose / capo / key readouts. Both states share one grid cell
// so the swap is overlapped, then clipped by overflow-hidden.
export function RollValue({ value, className = '' }) {
  const enabled = useMotionEnabled()
  if (!enabled) return <span className={className}>{value}</span>
  return (
    <span className={`inline-grid overflow-hidden ${className}`}>
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={String(value)}
          style={{ gridArea: '1 / 1' }}
          initial={{ y: '110%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: '-110%', opacity: 0 }}
          transition={spring}
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  )
}
