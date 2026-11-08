import { Component } from 'react'
import { isChunkLoadError, reloadOnceForStaleChunk } from '../lib/chunkReload'

// Catches render errors below it so one broken view shows a recoverable
// message instead of blanking the whole app. Chunk-load failures (a lazy view
// whose hashed file disappeared after a deploy) get one automatic reload.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    if (isChunkLoadError(error) && reloadOnceForStaleChunk()) return
    console.error('Unhandled render error:', error, info?.componentStack)
  }

  componentDidUpdate(prevProps) {
    // Navigating elsewhere clears the error (resetKey = pathname).
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null })
    }
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    const stale = isChunkLoadError(error)
    return (
      <div role="alert" className="mx-auto max-w-md px-6 py-24 text-center">
        <h2 className="text-lg font-semibold text-[var(--color-ink)]">
          {stale ? 'A new version is available' : 'Something went wrong'}
        </h2>
        <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
          {stale
            ? 'Reload to get the latest version of ChordVault.'
            : 'This page hit an unexpected error. Your saved songs and setlists are safe.'}
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <button
            type="button"
            className="rounded-lg bg-[var(--color-ink)] px-4 py-2 text-sm font-medium text-[var(--color-bg)]"
            onClick={() => window.location.reload()}
          >
            Reload
          </button>
          {!stale && (
            <a
              href="/"
              className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-ink)]"
            >
              Go to library
            </a>
          )}
        </div>
      </div>
    )
  }
}
