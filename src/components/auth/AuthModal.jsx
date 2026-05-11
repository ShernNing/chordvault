import React, { useState } from 'react'
import { Cloud, Mail, X, AlertCircle, CheckCircle2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { Button, Input } from '../ui'

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  )
}

export default function AuthModal({ isOpen, onClose }) {
  const [step, setStep] = useState('email') // 'email' | 'sent'
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error, setError] = useState('')

  if (!isOpen) return null

  const handleClose = () => {
    setStep('email'); setEmail(''); setError('')
    onClose()
  }

  const handleGoogle = async () => {
    setGoogleLoading(true); setError('')
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin },
      })
      if (error) throw error
      // browser redirects — no local state change needed
    } catch (err) {
      setError(err.message)
      setGoogleLoading(false)
    }
  }

  const handleSend = async (e) => {
    e.preventDefault()
    if (!email.trim()) return
    setLoading(true); setError('')
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: window.location.origin },
      })
      if (error) throw error
      setStep('sent')
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
              {step === 'sent'
                ? <Mail size={16} className="text-[var(--color-ink)]" />
                : <Cloud size={16} className="text-[var(--color-ink)]" />
              }
            </div>
            <div>
              <h2 className="text-sm font-semibold text-[var(--color-ink)]">
                {step === 'sent' ? 'Check your email' : 'Sign in to sync'}
              </h2>
              <p className="text-xs text-[var(--color-ink-muted)] mt-0.5">
                {step === 'sent' ? `Link sent to ${email}` : 'Sync songs across all your devices'}
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
          <div className="flex flex-col gap-4">
            <Button
              type="button"
              variant="secondary"
              size="lg"
              loading={googleLoading}
              onClick={handleGoogle}
              className="w-full flex items-center justify-center gap-2"
            >
              <GoogleIcon />
              Continue with Google
            </Button>

            <div className="flex items-center gap-3">
              <div className="flex-1 border-t border-[var(--color-border)]" />
              <span className="text-xs text-[var(--color-ink-muted)]">or</span>
              <div className="flex-1 border-t border-[var(--color-border)]" />
            </div>

            <form onSubmit={handleSend} className="flex flex-col gap-4">
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
                Send sign-in link
              </Button>
            </form>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 py-2 text-center">
            <CheckCircle2 size={36} className="text-green-500" />
            <div>
              <p className="text-sm text-[var(--color-ink)]">Sign-in link sent!</p>
              <p className="text-xs text-[var(--color-ink-muted)] mt-1">
                Click the link in your email to sign in.<br />
                You can close this window.
              </p>
            </div>
            <Button variant="secondary" size="md" onClick={handleClose} className="w-full">
              Close
            </Button>
          </div>
        )}

        {step === 'email' && (
          <button
            type="button"
            onClick={handleClose}
            className="mt-4 w-full text-xs text-center text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] transition-colors"
          >
            Continue without syncing →
          </button>
        )}
      </div>
    </div>
  )
}
