import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, ListMusic, Trash2, Calendar } from 'lucide-react'
import { useSetlists } from '../lib/hooks'
import { useToast } from '../lib/toast'
import { Button, Input, EmptyState, ErrorState, Skeleton, Modal } from '../components/ui'

function formatDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric'
  })
}

export default function Setlists() {
  const { setlists, loading, error, reload, createSetlist, deleteSetlist } = useSetlists()
  const toast = useToast()
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [formError, setFormError] = useState('')

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!newName.trim()) { setFormError('Name is required'); return }
    setCreating(true)
    setFormError('')
    try {
      await createSetlist(newName.trim())
      setNewName('')
    } catch (err) {
      // Unauthenticated inserts surface as a raw Postgres RLS violation.
      const msg = /row-level security/i.test(err?.message || '')
        ? 'Sign in to create setlists — they sync to your team account.'
        : err.message
      setFormError(msg)
    } finally {
      setCreating(false)
    }
  }

  if (error) return <ErrorState message={error} onRetry={reload} />

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="font-display text-2xl text-[var(--color-ink)]">Setlists</h1>
        <p className="text-xs text-[var(--color-ink-muted)] mt-0.5">
          Organise songs into ordered setlists for services or events.
        </p>
      </div>

      {/* Create form */}
      <form onSubmit={handleCreate} className="flex gap-2 p-4 border border-[var(--color-border)] rounded-lg bg-[var(--color-bg-warm)]">
        <div className="flex-1">
          <Input
            placeholder="New setlist name — e.g. Sunday 22 March"
            value={newName}
            onChange={e => { setNewName(e.target.value); setFormError('') }}
            error={formError}
          />
        </div>
        <Button
          type="submit"
          variant="primary"
          size="md"
          loading={creating}
          disabled={!newName.trim()}
          className="shrink-0 self-start"
        >
          <Plus size={14} /> Create
        </Button>
      </form>

      {/* List */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : setlists.length === 0 ? (
        <EmptyState
          icon={ListMusic}
          title="No setlists yet"
          description="Create a setlist to organise songs for your next service."
        />
      ) : (
        <div className="space-y-2">
          {setlists.map(setlist => (
            <div
              key={setlist.id}
              className="group flex items-center justify-between p-4 border border-[var(--color-border)] rounded-lg bg-[var(--color-bg)] hover:border-[var(--color-ink-muted)] transition-all duration-150"
            >
              <Link
                to={`/setlists/${setlist.id}`}
                className="flex-1 min-w-0"
              >
                <div className="text-sm font-semibold text-[var(--color-ink)] truncate">
                  {setlist.name}
                </div>
                <div className="flex items-center gap-1 mt-0.5">
                  <Calendar size={10} className="text-[var(--color-ink-muted)]" />
                  <span className="text-[10px] text-[var(--color-ink-muted)]">
                    Created {formatDate(setlist.created_at)}
                  </span>
                </div>
              </Link>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setDeleteTarget(setlist)}
                className="text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity ml-2"
                title="Delete setlist"
              >
                <Trash2 size={13} />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Delete confirm */}
      <Modal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete setlist"
      >
        <p className="text-sm text-[var(--color-ink-soft)] mb-5">
          Delete <strong>"{deleteTarget?.name}"</strong>? This won't delete the songs themselves.
        </p>
        <div className="flex gap-2 justify-end">
          <Button variant="secondary" size="sm" onClick={() => setDeleteTarget(null)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            size="sm"
            loading={deleting}
            onClick={async () => {
              setDeleting(true)
              try {
                await deleteSetlist(deleteTarget.id)
                toast.success(`Deleted "${deleteTarget.name}"`)
                setDeleteTarget(null)
              } catch (e) {
                toast.error(e.message || 'Delete failed')
              } finally {
                setDeleting(false)
              }
            }}
          >
            <Trash2 size={13} /> Delete
          </Button>
        </div>
      </Modal>
    </div>
  )
}
