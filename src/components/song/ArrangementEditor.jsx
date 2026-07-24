import { useMemo, useState } from "react";
import {
  X,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Copy,
  Check,
  RotateCcw,
  ListOrdered,
} from "lucide-react";
import { splitSections, defaultPlan, applyArrangement } from "../../lib/arrangement";
import { Button } from "../ui";

/**
 * Non-destructive-feeling arrangement builder. Reorder / repeat the song's
 * detected sections into a new running order, then Apply to rewrite
 * parsed_content. SongView snapshots the previous content so Apply is revertible.
 *
 * Props:
 *   song       , song object (parsed_content)
 *   onApply    , (newParsedContent) => Promise|void
 *   onClose    , () => void
 */
export default function ArrangementEditor({
  song,
  onApply,
  onRevert,
  canRevert = false,
  onClose,
}) {
  const segments = useMemo(
    () => splitSections(song.parsed_content),
    [song.parsed_content],
  );
  const [plan, setPlan] = useState(() => defaultPlan(song.parsed_content));
  const [saving, setSaving] = useState(false);

  const labelOf = (index) => segments[index]?.label ?? `Section ${index + 1}`;
  const totalSections = plan.reduce((n, s) => n + Math.max(1, s.repeat || 1), 0);

  const move = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= plan.length) return;
    setPlan((p) => {
      const next = p.slice();
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };
  const setRepeat = (i, delta) =>
    setPlan((p) =>
      p.map((s, k) =>
        k === i ? { ...s, repeat: Math.max(1, (s.repeat || 1) + delta) } : s,
      ),
    );
  const duplicate = (i) =>
    setPlan((p) => [...p.slice(0, i + 1), { ...p[i], repeat: 1 }, ...p.slice(i + 1)]);
  const remove = (i) => setPlan((p) => p.filter((_, k) => k !== i));
  const addSection = (index) =>
    setPlan((p) => [...p, { index, repeat: 1 }]);
  const resetPlan = () => setPlan(defaultPlan(song.parsed_content));

  const apply = async () => {
    if (!plan.length || saving) return;
    setSaving(true);
    try {
      await onApply(applyArrangement(song.parsed_content, plan));
    } finally {
      setSaving(false);
    }
  };

  const noSections = segments.length === 0;

  return (
    <>
      <div className='fixed inset-0 z-[45] bg-black/40 no-print' onClick={onClose} />
      <aside className='fixed top-0 right-0 bottom-0 z-50 w-full sm:w-[420px] max-w-[100vw] bg-[var(--color-bg)] border-l border-[var(--color-border)] shadow-2xl no-print flex flex-col'>
        <header className='flex items-center justify-between gap-3 px-4 h-12 border-b border-[var(--color-border)] shrink-0'>
          <div className='flex items-center gap-2 min-w-0'>
            <ListOrdered size={16} className='text-[var(--color-ink-soft)] shrink-0' />
            <span className='font-display text-base text-[var(--color-ink)] truncate'>
              Arrangement
            </span>
            <span className='text-xs text-[var(--color-ink-muted)] shrink-0'>
              · {totalSections} section{totalSections === 1 ? "" : "s"}
            </span>
          </div>
          <button
            onClick={onClose}
            className='w-8 h-8 rounded flex items-center justify-center text-[var(--color-ink-soft)] hover:text-[var(--color-ink)] hover:bg-[var(--color-bg-warm)]'
            aria-label='Close'
          >
            <X size={16} />
          </button>
        </header>

        {noSections ? (
          <div className='flex-1 flex items-center justify-center p-6 text-center text-xs text-[var(--color-ink-muted)] italic'>
            No sections detected. Add section headers (e.g. [Verse], [Chorus]) to
            the song first.
          </div>
        ) : (
          <>
            <div className='flex-1 overflow-y-auto p-3 space-y-2'>
              {plan.map((step, i) => (
                <div
                  key={i}
                  className='flex items-center gap-2 p-2 rounded border border-[var(--color-border)] bg-[var(--color-bg-warm)]'
                >
                  <span className='w-5 text-center text-[10px] font-mono text-[var(--color-ink-muted)]'>
                    {i + 1}
                  </span>
                  <span className='flex-1 min-w-0 text-sm text-[var(--color-ink)] truncate'>
                    {labelOf(step.index)}
                  </span>

                  {/* Repeat stepper */}
                  <div className='flex items-center gap-0.5 shrink-0'>
                    <button
                      onClick={() => setRepeat(i, -1)}
                      disabled={(step.repeat || 1) <= 1}
                      className='w-5 h-5 rounded text-[var(--color-ink-soft)] hover:bg-[var(--color-bg)] disabled:opacity-30'
                    >
                      −
                    </button>
                    <span className='w-7 text-center font-mono text-xs text-[var(--color-ink)]'>
                      ×{step.repeat || 1}
                    </span>
                    <button
                      onClick={() => setRepeat(i, +1)}
                      className='w-5 h-5 rounded text-[var(--color-ink-soft)] hover:bg-[var(--color-bg)]'
                    >
                      +
                    </button>
                  </div>

                  <div className='flex items-center gap-0.5 shrink-0'>
                    <button onClick={() => move(i, -1)} disabled={i === 0} title='Move up' className='p-1 rounded text-[var(--color-ink-soft)] hover:bg-[var(--color-bg)] disabled:opacity-30'>
                      <ArrowUp size={13} />
                    </button>
                    <button onClick={() => move(i, +1)} disabled={i === plan.length - 1} title='Move down' className='p-1 rounded text-[var(--color-ink-soft)] hover:bg-[var(--color-bg)] disabled:opacity-30'>
                      <ArrowDown size={13} />
                    </button>
                    <button onClick={() => duplicate(i)} title='Duplicate' className='p-1 rounded text-[var(--color-ink-soft)] hover:bg-[var(--color-bg)]'>
                      <Copy size={13} />
                    </button>
                    <button onClick={() => remove(i)} title='Remove' className='p-1 rounded text-red-500 hover:bg-[var(--color-bg)]'>
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
              {plan.length === 0 && (
                <p className='text-xs text-[var(--color-ink-muted)] italic text-center py-6'>
                  Empty arrangement. Add sections below.
                </p>
              )}

              {/* Add-section palette */}
              <div className='pt-2 border-t border-[var(--color-border)]'>
                <span className='text-[10px] text-[var(--color-ink-muted)] uppercase tracking-wide block mb-1'>
                  Add section
                </span>
                <div className='flex flex-wrap gap-1'>
                  {segments.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => addSection(s.id)}
                      className='flex items-center gap-1 px-2 h-7 text-xs rounded border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-ink-soft)] hover:text-[var(--color-ink)] hover:border-[var(--color-accent)]'
                    >
                      <Plus size={11} /> {s.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <footer className='border-t border-[var(--color-border)] px-3 py-2 shrink-0 flex items-center gap-2'>
              <Button variant='ghost' size='sm' onClick={resetPlan}>
                <RotateCcw size={12} /> Reset
              </Button>
              {canRevert && onRevert && (
                <Button variant='ghost' size='sm' onClick={onRevert}>
                  Revert
                </Button>
              )}
              <div className='flex-1' />
              <Button
                variant='primary'
                size='sm'
                onClick={apply}
                disabled={plan.length === 0 || saving}
              >
                <Check size={13} /> {saving ? "Applying…" : "Apply arrangement"}
              </Button>
            </footer>
          </>
        )}
      </aside>
    </>
  );
}
