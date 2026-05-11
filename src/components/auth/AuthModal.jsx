import React, { useState, useEffect, useRef } from 'react'
import { Cloud, Loader2, AlertCircle, Info, KeyRound, X } from 'lucide-react'
import { Button, Input } from '../ui'

export default function AuthModal({ interaction }) {
  const [values, setValues] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const firstInputRef = useRef(null)

  useEffect(() => {
    setValues({})
    setTimeout(() => firstInputRef.current?.focus(), 50)
  }, [interaction?.type])

  if (!interaction) return null

  if (interaction.type === 'loading') {
    return (
      <Overlay>
        <div className="flex flex-col items-center gap-3 py-4">
          <Loader2 size={24} className="animate-spin text-[var(--color-ink-muted)]" />
          <p className="text-sm text-[var(--color-ink-soft)]">{interaction.title || 'Connecting…'}</p>
        </div>
      </Overlay>
    )
  }

  const fieldEntries = Object.entries(interaction.fields ?? {})
  const isOtp = interaction.type === 'otp'

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      interaction.onSubmit(values)
    } finally {
      setSubmitting(false)
    }
  }

  const handleCancel = () => interaction.onCancel()

  return (
    <Overlay onClickOutside={handleCancel}>
      <div
        className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl shadow-2xl w-full max-w-sm p-6 animate-fade-in"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[var(--color-bg-warm)] border border-[var(--color-border)] flex items-center justify-center shrink-0">
              {isOtp
                ? <KeyRound size={16} className="text-[var(--color-ink)]" />
                : <Cloud size={16} className="text-[var(--color-ink)]" />
              }
            </div>
            <div>
              <h2 className="text-sm font-semibold text-[var(--color-ink)]">{interaction.title}</h2>
              <p className="text-xs text-[var(--color-ink-muted)] mt-0.5">
                {isOtp ? 'Enter the code we sent you' : 'Sync songs across all your devices'}
              </p>
            </div>
          </div>
          {interaction.cancelLabel != null && (
            <button onClick={handleCancel} className="text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] transition-colors">
              <X size={16} />
            </button>
          )}
        </div>

        {/* Alerts */}
        {interaction.alerts?.map((alert, i) => (
          <AlertBanner key={i} alert={alert} />
        ))}

        {/* OAuth options (social login buttons) */}
        {interaction.options?.length > 0 && (
          <div className="flex flex-col gap-2 mb-4">
            {interaction.options.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => interaction.onSubmit({ [opt.name]: opt.value })}
                className="flex items-center gap-3 w-full h-10 px-4 rounded-lg border border-[var(--color-border)] text-sm text-[var(--color-ink)] hover:bg-[var(--color-bg-warm)] transition-colors"
              >
                {opt.iconUrl && <img src={opt.iconUrl} alt="" className="w-4 h-4" />}
                {opt.displayName}
              </button>
            ))}
            {fieldEntries.length > 0 && (
              <div className="flex items-center gap-2 my-1">
                <hr className="flex-1 border-[var(--color-border)]" />
                <span className="text-xs text-[var(--color-ink-muted)]">or</span>
                <hr className="flex-1 border-[var(--color-border)]" />
              </div>
            )}
          </div>
        )}

        {/* Fields + submit */}
        {(fieldEntries.length > 0 || interaction.type === 'message-alert' || interaction.type === 'logout-confirmation') && (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {fieldEntries.map(([name, field], i) => (
              <Input
                key={name}
                ref={i === 0 ? firstInputRef : undefined}
                label={field.label}
                type={field.type === 'otp' ? 'text' : field.type}
                placeholder={field.placeholder}
                value={values[name] || ''}
                autoComplete={name === 'otp' ? 'one-time-code' : name === 'email' ? 'email' : undefined}
                inputMode={name === 'otp' ? 'numeric' : undefined}
                onChange={e => setValues(v => ({ ...v, [name]: e.target.value }))}
                size="lg"
              />
            ))}

            <Button type="submit" variant="primary" size="lg" loading={submitting} className="w-full mt-1">
              {interaction.submitLabel || 'Continue'}
            </Button>
          </form>
        )}

        {/* Cancel */}
        {interaction.cancelLabel && (
          <button
            type="button"
            onClick={handleCancel}
            className="mt-4 w-full text-xs text-center text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] transition-colors"
          >
            {interaction.cancelLabel}
          </button>
        )}
      </div>
    </Overlay>
  )
}

function AlertBanner({ alert }) {
  const isError = alert.type === 'error'
  const isInfo = alert.type === 'info'
  return (
    <div className={`flex items-start gap-2 mb-4 p-3 rounded-lg text-xs border ${
      isError
        ? 'bg-red-50 border-red-200 text-red-700 dark:bg-red-950 dark:border-red-800 dark:text-red-300'
        : isInfo
        ? 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-950 dark:border-blue-800 dark:text-blue-300'
        : 'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950 dark:border-amber-800 dark:text-amber-300'
    }`}>
      {isError ? <AlertCircle size={13} className="shrink-0 mt-0.5" /> : <Info size={13} className="shrink-0 mt-0.5" />}
      {alert.message}
    </div>
  )
}

function Overlay({ children, onClickOutside }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={onClickOutside}
    >
      {children}
    </div>
  )
}
