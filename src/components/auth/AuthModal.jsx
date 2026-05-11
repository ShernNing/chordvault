import React, { useState, useEffect, useRef } from 'react'
import { Cloud, Loader2, AlertCircle, Mail, KeyRound, X } from 'lucide-react'
import { Button, Input } from '../ui'

export default function AuthModal({ interaction, onSkip }) {
  const [values, setValues] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const firstInputRef = useRef(null)

  useEffect(() => {
    setValues({})
    setTimeout(() => firstInputRef.current?.focus(), 50)
  }, [interaction?.type])

  if (!interaction || interaction.type === 'loading') {
    return interaction?.type === 'loading' ? (
      <Overlay>
        <div className="flex flex-col items-center gap-3 py-4">
          <Loader2 size={24} className="animate-spin text-[var(--color-ink-muted)]" />
          <p className="text-sm text-[var(--color-ink-soft)]">{interaction.title || 'Connecting…'}</p>
        </div>
      </Overlay>
    ) : null
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      interaction.submit(values)
    } finally {
      setSubmitting(false)
    }
  }

  const handleCancel = () => {
    interaction.cancel()
    onSkip?.()
  }

  const isEmail = interaction.type === 'email'
  const isOtp = interaction.type === 'otp'

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
              {isOtp ? <KeyRound size={16} className="text-[var(--color-ink)]" /> : <Cloud size={16} className="text-[var(--color-ink)]" />}
            </div>
            <div>
              <h2 className="text-sm font-semibold text-[var(--color-ink)]">
                {isOtp ? 'Check your email' : 'Sign in to sync'}
              </h2>
              <p className="text-xs text-[var(--color-ink-muted)] mt-0.5">
                {isOtp ? 'Enter the code we sent you' : 'Sync songs across all your devices'}
              </p>
            </div>
          </div>
          <button
            onClick={handleCancel}
            className="text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Alerts */}
        {interaction.alerts?.filter(a => a.type === 'error').map((alert, i) => (
          <div key={i} className="flex items-start gap-2 mb-4 p-3 rounded-lg bg-red-50 border border-red-200 dark:bg-red-950 dark:border-red-800">
            <AlertCircle size={14} className="text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
            <p className="text-xs text-red-700 dark:text-red-300">{alert.message}</p>
          </div>
        ))}

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {interaction.fields?.map((field, i) => (
            <Input
              key={field.name}
              ref={i === 0 ? firstInputRef : undefined}
              label={field.label}
              type={field.type || 'text'}
              placeholder={field.placeholder || (isOtp ? '123456' : 'you@example.com')}
              value={values[field.name] || ''}
              autoComplete={isOtp ? 'one-time-code' : 'email'}
              inputMode={isOtp ? 'numeric' : undefined}
              onChange={e => setValues(v => ({ ...v, [field.name]: e.target.value }))}
              size="lg"
            />
          ))}

          <Button type="submit" variant="primary" size="lg" loading={submitting} className="w-full mt-1">
            {isOtp ? 'Verify code' : 'Send sign-in code'}
          </Button>
        </form>

        {/* Skip */}
        <button
          type="button"
          onClick={handleCancel}
          className="mt-4 w-full text-xs text-center text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] transition-colors"
        >
          {isOtp ? 'Cancel and use locally' : 'Continue without syncing →'}
        </button>
      </div>
    </Overlay>
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
