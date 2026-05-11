import React, { useEffect } from 'react'
import { Loader2, AlertCircle, RefreshCw, Music } from 'lucide-react'

// ─── Button ────────────────────────────────────────────────────────────────
export function Button({
  children,
  variant = 'primary',
  size = 'md',
  className = '',
  disabled,
  loading,
  onClick,
  type = 'button',
  title,
  ...props
}) {
  const base = 'inline-flex items-center justify-center gap-2 font-sans font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed select-none'

  const variants = {
    primary: 'bg-[var(--color-ink)] text-[var(--color-bg)] hover:opacity-80 active:scale-[0.98] focus-visible:ring-[var(--color-ink)]',
    secondary: 'bg-transparent border border-[var(--color-border)] text-[var(--color-ink)] hover:border-[var(--color-ink)] hover:bg-[var(--color-bg-warm)] active:scale-[0.98] focus-visible:ring-[var(--color-ink)]',
    ghost: 'bg-transparent text-[var(--color-ink-soft)] hover:text-[var(--color-ink)] hover:bg-[var(--color-bg-warm)] active:scale-[0.98]',
    danger: 'bg-transparent border border-red-300 text-red-600 hover:bg-red-50 hover:border-red-500 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950 active:scale-[0.98]',
    accent: 'bg-[var(--color-accent)] text-black hover:opacity-90 active:scale-[0.98] focus-visible:ring-[var(--color-accent)]',
  }

  const sizes = {
    xs: 'h-6 px-2 text-xs rounded',
    sm: 'h-7 px-3 text-xs rounded',
    md: 'h-8 px-4 text-sm rounded',
    lg: 'h-10 px-5 text-sm rounded',
    icon: 'h-8 w-8 rounded',
    'icon-sm': 'h-7 w-7 rounded',
    'icon-lg': 'h-10 w-10 rounded',
  }

  return (
    <button
      type={type}
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={disabled || loading}
      onClick={onClick}
      title={title}
      {...props}
    >
      {loading ? <Loader2 size={14} className="animate-spin" /> : children}
    </button>
  )
}

// ─── Input ─────────────────────────────────────────────────────────────────
export function Input({
  label,
  error,
  hint,
  className = '',
  containerClassName = '',
  size = 'md',
  ...props
}) {
  const sizes = {
    sm: 'h-7 px-2 text-xs',
    md: 'h-8 px-3 text-sm',
    lg: 'h-10 px-3 text-sm',
  }

  return (
    <div className={`flex flex-col gap-1 ${containerClassName}`}>
      {label && (
        <label className="text-xs font-medium text-[var(--color-ink-soft)] uppercase tracking-wide">
          {label}
        </label>
      )}
      <input
        className={`
          w-full bg-[var(--color-bg)] border border-[var(--color-border)]
          text-[var(--color-ink)] placeholder-[var(--color-ink-muted)]
          rounded transition-colors duration-150
          hover:border-[var(--color-ink-muted)]
          focus:outline-none focus:border-[var(--color-ink)]
          disabled:opacity-50 disabled:cursor-not-allowed
          font-sans
          ${sizes[size]}
          ${error ? 'border-red-400 focus:border-red-500' : ''}
          ${className}
        `}
        {...props}
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
      {hint && !error && <p className="text-xs text-[var(--color-ink-muted)]">{hint}</p>}
    </div>
  )
}

// ─── Textarea ──────────────────────────────────────────────────────────────
export function Textarea({ label, error, hint, className = '', containerClassName = '', ...props }) {
  return (
    <div className={`flex flex-col gap-1 ${containerClassName}`}>
      {label && (
        <label className="text-xs font-medium text-[var(--color-ink-soft)] uppercase tracking-wide">
          {label}
        </label>
      )}
      <textarea
        className={`
          w-full bg-[var(--color-bg)] border border-[var(--color-border)]
          text-[var(--color-ink)] placeholder-[var(--color-ink-muted)]
          rounded transition-colors duration-150
          hover:border-[var(--color-ink-muted)]
          focus:outline-none focus:border-[var(--color-ink)]
          disabled:opacity-50 disabled:cursor-not-allowed
          font-mono text-xs p-3 resize-none
          ${error ? 'border-red-400 focus:border-red-500' : ''}
          ${className}
        `}
        {...props}
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
      {hint && !error && <p className="text-xs text-[var(--color-ink-muted)]">{hint}</p>}
    </div>
  )
}

// ─── Select ────────────────────────────────────────────────────────────────
export function Select({ label, children, className = '', containerClassName = '', ...props }) {
  return (
    <div className={`flex flex-col gap-1 ${containerClassName}`}>
      {label && (
        <label className="text-xs font-medium text-[var(--color-ink-soft)] uppercase tracking-wide">
          {label}
        </label>
      )}
      <select
        className={`
          h-8 px-2 bg-[var(--color-bg)] border border-[var(--color-border)]
          text-[var(--color-ink)] text-sm rounded
          hover:border-[var(--color-ink-muted)]
          focus:outline-none focus:border-[var(--color-ink)]
          transition-colors duration-150 cursor-pointer font-sans
          ${className}
        `}
        {...props}
      >
        {children}
      </select>
    </div>
  )
}

// ─── Badge ─────────────────────────────────────────────────────────────────
export function Badge({ children, variant = 'default', className = '' }) {
  const variants = {
    default: 'bg-[var(--color-bg-warm)] text-[var(--color-ink-soft)] border border-[var(--color-border)]',
    key: 'bg-[var(--color-ink)] text-[var(--color-bg)] font-mono',
    accent: 'bg-[var(--color-accent-soft)] text-[var(--color-accent)] border border-[var(--color-accent)]',
    warning: 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800',
    success: 'bg-green-50 text-green-700 border border-green-200 dark:bg-green-950 dark:text-green-300',
  }

  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${variants[variant]} ${className}`}>
      {children}
    </span>
  )
}

// ─── Divider ───────────────────────────────────────────────────────────────
export function Divider({ className = '' }) {
  return <hr className={`border-[var(--color-border)] ${className}`} />
}

// ─── Skeleton ──────────────────────────────────────────────────────────────
export function Skeleton({ className = '', ...props }) {
  return (
    <div
      className={`animate-pulse bg-[var(--color-border)] rounded ${className}`}
      {...props}
    />
  )
}

export function SongCardSkeleton() {
  return (
    <div className="border border-[var(--color-border)] rounded p-4 space-y-2">
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-3 w-1/2" />
      <div className="flex gap-2 pt-1">
        <Skeleton className="h-5 w-8" />
        <Skeleton className="h-5 w-12" />
      </div>
    </div>
  )
}

export function SongViewSkeleton() {
  return (
    <div className="space-y-4 p-6">
      <Skeleton className="h-6 w-1/3" />
      <Skeleton className="h-4 w-1/4" />
      <div className="space-y-1 mt-6">
        {[...Array(8)].map((_, i) => (
          <Skeleton key={i} className={`h-3 ${i % 3 === 0 ? 'w-1/3' : i % 2 === 0 ? 'w-2/3' : 'w-full'}`} />
        ))}
      </div>
    </div>
  )
}

// ─── Empty State ───────────────────────────────────────────────────────────
export function EmptyState({ icon: Icon = Music, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-8 text-center animate-fade-in">
      <div className="w-14 h-14 rounded-full border-2 border-dashed border-[var(--color-border)] flex items-center justify-center mb-4">
        <Icon size={22} className="text-[var(--color-ink-muted)]" />
      </div>
      <h3 className="text-sm font-semibold text-[var(--color-ink)] mb-1">{title}</h3>
      {description && (
        <p className="text-xs text-[var(--color-ink-muted)] mb-5 max-w-xs">{description}</p>
      )}
      {action}
    </div>
  )
}

// ─── Error State ───────────────────────────────────────────────────────────
export function ErrorState({ message, onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-8 text-center">
      <AlertCircle size={22} className="text-red-400 mb-3" />
      <p className="text-sm text-[var(--color-ink-soft)] mb-4">{message || 'Something went wrong'}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          <RefreshCw size={13} /> Retry
        </Button>
      )}
    </div>
  )
}

// ─── Tag Input ─────────────────────────────────────────────────────────────
export function TagInput({ tags = [], onChange, placeholder = 'Add tag...' }) {
  const [inputValue, setInputValue] = React.useState('')

  const addTag = (val) => {
    const tag = val.trim().toLowerCase()
    if (tag && !tags.includes(tag)) {
      onChange([...tags, tag])
    }
    setInputValue('')
  }

  const removeTag = (tag) => {
    onChange(tags.filter(t => t !== tag))
  }

  return (
    <div className="flex flex-wrap gap-1.5 p-2 border border-[var(--color-border)] rounded min-h-[36px] hover:border-[var(--color-ink-muted)] focus-within:border-[var(--color-ink)] transition-colors">
      {tags.map(tag => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 px-2 py-0.5 bg-[var(--color-bg-warm)] border border-[var(--color-border)] rounded text-xs text-[var(--color-ink-soft)]"
        >
          {tag}
          <button
            type="button"
            onClick={() => removeTag(tag)}
            className="text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] leading-none"
          >
            ×
          </button>
        </span>
      ))}
      <input
        type="text"
        value={inputValue}
        onChange={e => setInputValue(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault()
            addTag(inputValue)
          }
          if (e.key === 'Backspace' && !inputValue && tags.length > 0) {
            removeTag(tags[tags.length - 1])
          }
        }}
        onBlur={() => { if (inputValue) addTag(inputValue) }}
        placeholder={tags.length === 0 ? placeholder : ''}
        className="flex-1 min-w-[80px] bg-transparent text-xs text-[var(--color-ink)] placeholder-[var(--color-ink-muted)] outline-none"
      />
    </div>
  )
}

// ─── Modal ─────────────────────────────────────────────────────────────────
export function Modal({ isOpen, onClose, title, children, className = '' }) {
  useEffect(() => {
    if (!isOpen) return
    const handleKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className={`
          relative z-10 bg-[var(--color-bg)] border border-[var(--color-border)]
          rounded-lg shadow-2xl w-full max-w-md animate-slide-up
          ${className}
        `}
      >
        {title && (
          <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)]">
            <h2 className="text-sm font-semibold text-[var(--color-ink)]">{title}</h2>
            <button
              onClick={onClose}
              className="text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] transition-colors text-lg leading-none"
            >
              ×
            </button>
          </div>
        )}
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

// ─── Tooltip ──────────────────────────────────────────────────────────────
// direction: 'below' (default) | 'above'
export function Tooltip({ children, content, direction = 'below' }) {
  const posClass = direction === 'above'
    ? 'bottom-full left-1/2 -translate-x-1/2 mb-1.5'
    : 'top-full left-1/2 -translate-x-1/2 mt-1.5'

  return (
    <div className="relative group inline-flex">
      {children}
      <div className={`absolute ${posClass} px-2 py-1 bg-[var(--color-ink)] text-[var(--color-bg)] text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50`}>
        {content}
        {/* Small arrow */}
        <span className={`absolute left-1/2 -translate-x-1/2 w-0 h-0 ${
          direction === 'above'
            ? 'top-full border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-[var(--color-ink)]'
            : 'bottom-full border-l-4 border-r-4 border-b-4 border-l-transparent border-r-transparent border-b-[var(--color-ink)]'
        }`} />
      </div>
    </div>
  )
}

