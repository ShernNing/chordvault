import React, { useState } from 'react'
import { Cloud, KeyRound, X, AlertCircle, Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { Button, Input } from '../ui'

export default function AuthModal({ isOpen, onClose }) {
  const [step, setStep] = useState('email') // 'email' | 'otp'
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  if (!isOpen) return null

  const handleClose = () => {
    setStep('email'); setEmail(''); setOtp(''); setError('')
    onClose()
  }

  const handleSendOtp = async (e) => {
    e.preventDefault()
    if (!email.trim()) return
    setLoading(true); setError('')
    try {
      const { error } = await supabase.auth.signInWithOtp({ email: email.trim() })
      if (error) throw error
      setStep('otp')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyOtp = async (e) => {
    e.preventDefault()
    if (!otp.trim()) return
    setLoading(true); setError('')
    try {
      const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: otp.trim(), type: 'email' })
      if (error) throw error
      handleClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div
        className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl shadow-2xl w-full max-w-sm p-6 animate-fade-in"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[var(--color-bg-warm)] border border-[var(--color-border)] flex items-center justify-center shrink-0">
              {step === 'otp'
                ? <KeyRound size={16} className="text-[var(--color-ink)]" />
                : <Cloud size={16} className="text-[var(--color-ink)]" />
              }
            </div>
            <div>
              <h2 className="text-sm font-semibold text-[var(--color-ink)]">
                {step === 'otp' ? 'Check your email' : 'Sign in to sync'}
              </h2>
              <p className="text-xs text-[var(--color-ink-muted)] mt-0.5">
                {step === 'otp' ? `Code sent to ${email}` : 'Sync songs across all your devices'}
              </p>
            </div>
          </div>
          <button onClick={handleClose} className="text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] transition-colors">
            <X size={16} />
          </button>
        </div>

        {error && (
          <div className="flex items-start gap-2 mb-4 p-3 rounded-lg bg-red-50 border border-red-200 dark:bg-red-950 dark:border-red-800">
            <AlertCircle size={13} className="text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
            <p className="text-xs text-red-700 dark:text-red-300">{error}</p>
          </div>
        )}

        {step === 'email' ? (
          <form onSubmit={handleSendOtp} className="flex flex-col gap-4">
            <Input
              label="Email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoComplete="email"
              size="lg"
              autoFocus
            />
            <Button type="submit" variant="primary" size="lg" loading={loading} className="w-full">
              Send sign-in code
            </Button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} className="flex flex-col gap-4">
            <Input
              label="One-time code"
              type="text"
              placeholder="123456"
              value={otp}
              onChange={e => setOtp(e.target.value)}
              autoComplete="one-time-code"
              inputMode="numeric"
              size="lg"
              autoFocus
            />
            <Button type="submit" variant="primary" size="lg" loading={loading} className="w-full">
              Verify code
            </Button>
          </form>
        )}

        <button
          type="button"
          onClick={step === 'otp' ? () => { setStep('email'); setOtp(''); setError('') } : handleClose}
          className="mt-4 w-full text-xs text-center text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] transition-colors"
        >
          {step === 'otp' ? '← Use a different email' : 'Continue without syncing →'}
        </button>
      </div>
    </div>
  )
}
