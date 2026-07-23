import { useEffect, useMemo, useRef, useState } from "react";
import { X, Plus, Trash2, Edit3, Check, Zap } from "lucide-react";
import FretboardDiagram from "../voicings/FretboardDiagram";
import { voicingsForChord } from "../../lib/voicings/lookup";
import { bestTransposeFrets } from "../../lib/voicings/transpose";
import { smartTransposeLick } from "../../lib/voicings/lickTranspose";
import { transposeChord } from "../../lib/transposition";
import { Button, Input } from "../ui";

// Entries stored in song.original_key reference frame.
// Two entry types:
//   chord: { id, type:'chord', chord, frets:[6], label }
//   lick:  { id, type:'lick', notes:[{string,fret,slideTo?,bend?}], label }, string 0=low E, 5=high e
//     slideTo: target fret (slide from fret → slideTo on same string)
//     bend:    semitones bent up (1 = half, 2 = full, 3 = 1½)
// `semitones` shifts both for live display only.

const STRING_LABELS = ["E", "A", "D", "G", "B", "e"];
// E/e case-sensitive (low vs high). Other letters case-insensitive.
const STRING_INDEX = {
  E: 0,
  A: 1,
  a: 1,
  D: 2,
  d: 2,
  G: 3,
  g: 3,
  B: 4,
  b: 4,
  e: 5,
};
const STRING_LETTER_RE = "[EeADGBadgb]";
const MAX_FRET_INPUT = 24;
const GRID_FRETS = 22; // fret rows 1..22; taller than viewport → scrolls
const SECTION_PRESETS = [
  "Intro",
  "Verse 1",
  "Verse 2",
  "Pre-Chorus",
  "Chorus",
  "Bridge",
  "Solo",
  "Outro",
];
const UNSECTIONED = "__unsectioned__";
// String row order in fretboard grid: high e on top, low E on bottom (standard tab notation)
const STRING_DISPLAY_ORDER = [5, 4, 3, 2, 1, 0];
const FRET_MARKER_SINGLE = new Set([3, 5, 7, 9, 15, 17, 19, 21]);
const FRET_MARKER_DOUBLE = new Set([12]);
const TOTAL_FRETS = 24; // 0 (open) + 1..23

function genId() {
  return Math.random().toString(36).slice(2, 10);
}

function entryType(e) {
  return e?.type || "chord";
}

function groupBySection(entries) {
  // Preserve section order by first appearance. Unsectioned bucket last.
  const order = [];
  const map = new Map();
  for (const e of entries) {
    const sec = (e.section || "").trim() || UNSECTIONED;
    if (!map.has(sec)) {
      map.set(sec, []);
      order.push(sec);
    }
    map.get(sec).push(e);
  }
  // Move UNSECTIONED to end if present
  const out = [];
  for (const s of order)
    if (s !== UNSECTIONED) out.push({ section: s, entries: map.get(s) });
  if (map.has(UNSECTIONED))
    out.push({ section: UNSECTIONED, entries: map.get(UNSECTIONED) });
  return out;
}

function transposeChordEntry(e, semitones, displayKey) {
  return {
    ...e,
    chord: transposeChord(e.chord, semitones, displayKey),
    frets: bestTransposeFrets(e.frets, semitones) || e.frets,
  };
}

function shiftFret(f, semitones) {
  let r = f + semitones;
  while (r < 0) r += 12;
  while (r > MAX_FRET_INPUT) r -= 12;
  return r;
}

function transposeLickEntry(e, semitones) {
  return {
    ...e,
    notes: (e.notes || []).map((n) => {
      const out = { string: n.string, fret: shiftFret(n.fret, semitones) };
      if (n.slideTo != null) out.slideTo = shiftFret(n.slideTo, semitones);
      if (n.bend != null) out.bend = n.bend;
      return out;
    }),
  };
}

function transposeForDisplay(entry, semitones, displayKey) {
  if (!semitones) return entry;
  return entryType(entry) === "lick"
    ? transposeLickEntry(entry, semitones)
    : transposeChordEntry(entry, semitones, displayKey);
}

export default function ElectricGuitarNotesPanel({
  song,
  semitones = 0,
  displayKey = null,
  onSave,
  onClose,
}) {
  // eslint-disable-next-line react-hooks/exhaustive-deps -- stored derives from song prop; re-memoising on song reference is intentional
  const stored = song.electric_guitar_notes || [];
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState(null);

  // Resizable panel width (desktop). Persisted across sessions.
  const [panelW, setPanelW] = useState(() => {
    if (typeof window === "undefined") return 460;
    const saved = parseInt(localStorage.getItem("cv-eg-panel-w") || "", 10);
    return Number.isFinite(saved) ? Math.min(Math.max(saved, 380), 1000) : 460;
  });
  useEffect(() => {
    try {
      localStorage.setItem("cv-eg-panel-w", String(panelW));
    } catch {}
  }, [panelW]);

  const onResizeDown = (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = panelW;
    const move = (ev) => {
      const dx = startX - ev.clientX; // drag left → wider
      const maxW = Math.min(window.innerWidth - 32, 1000);
      setPanelW(Math.min(Math.max(startW + dx, 380), maxW));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.style.userSelect = "";
    };
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // Naive-shift frame (same-string fret + semitones). NOT the render source —
  // it seeds `startEdit` and the `saveEntry` inverse, so it must stay in the
  // untouched original-key frame. The read-only list renders from `rendered` below.
  const displayed = useMemo(
    () => stored.map((e) => transposeForDisplay(e, semitones, displayKey)),
    [stored, semitones, displayKey],
  );

  // Read-only render frame: lick entries use smart relocation (off-neck notes
  // moved to same-pitch playable positions near their neighbors); chord entries
  // and the naive-shift edit/save path are unchanged. Editing still seeds from the
  // naive `displayed` memo, so relocation never corrupts the stored original-key
  // frame (see docs/superpowers/specs/2026-07-23-smart-lick-transpose-design.md).
  const rendered = useMemo(
    () =>
      stored.map((e) =>
        entryType(e) === "lick"
          ? { ...e, notes: smartTransposeLick(e.notes || [], semitones) }
          : transposeForDisplay(e, semitones, displayKey),
      ),
    [stored, semitones, displayKey],
  );

  const startAddChord = () => {
    setDraft({
      id: "new",
      type: "chord",
      chord: "",
      frets: [null, null, null, null, null, null],
      label: "",
      section: "",
    });
    setEditingId("new");
  };
  const startAddLick = () => {
    setDraft({
      id: "new",
      type: "lick",
      notes: [],
      label: "",
      section: "",
      lickText: "",
    });
    setEditingId("new");
  };

  const startEdit = (entry) => {
    const live = displayed.find((e) => e.id === entry.id);
    if (!live) return;
    if (entryType(live) === "lick") {
      setDraft({
        ...live,
        notes: (live.notes || []).map((n) => ({ ...n })),
        lickText: notesToText(live.notes),
      });
    } else {
      setDraft({ ...live, frets: live.frets.slice() });
    }
    setEditingId(entry.id);
  };

  const cancelEdit = () => {
    setDraft(null);
    setEditingId(null);
  };

  const saveEntry = async (keepAdding = false) => {
    if (!draft) return;
    const type = entryType(draft);

    let finalEntry;
    if (type === "lick") {
      const notes = parseLickText(draft.lickText || "");
      if (notes.length === 0) return;
      // Convert displayed → stored frame
      const storedNotes = semitones
        ? notes.map((n) => {
            let f = n.fret - semitones;
            while (f < 0) f += 12;
            while (f > MAX_FRET_INPUT) f -= 12;
            return { string: n.string, fret: f };
          })
        : notes;
      finalEntry = {
        id: draft.id === "new" ? genId() : draft.id,
        type: "lick",
        notes: storedNotes,
        label: (draft.label || "").trim(),
        section: (draft.section || "").trim(),
      };
    } else {
      if (!draft.chord.trim()) return;
      const storedChord = semitones
        ? transposeChord(draft.chord.trim(), -semitones, song.original_key)
        : draft.chord.trim();
      const storedFrets = semitones
        ? bestTransposeFrets(draft.frets, -semitones) || draft.frets
        : draft.frets;
      finalEntry = {
        id: draft.id === "new" ? genId() : draft.id,
        type: "chord",
        chord: storedChord,
        frets: storedFrets,
        label: (draft.label || "").trim(),
        section: (draft.section || "").trim(),
      };
    }

    const next =
      draft.id === "new"
        ? [...stored, finalEntry]
        : stored.map((e) => (e.id === finalEntry.id ? finalEntry : e));
    try {
      await onSave(next);
      if (keepAdding) {
        // Reopen a fresh draft of the same type, keeping the section so a run
        // of chords in one part can be added back-to-back without reopening.
        const section = (draft.section || "").trim();
        setDraft(
          type === "lick"
            ? { id: "new", type: "lick", notes: [], label: "", section, lickText: "" }
            : {
                id: "new",
                type: "chord",
                chord: "",
                frets: [null, null, null, null, null, null],
                label: "",
                section,
              },
        );
        setEditingId("new");
      } else {
        cancelEdit();
      }
    } catch (e) {
      // Error already surfaced by parent; keep editor open so user can retry
    }
  };

  const deleteEntry = async (id) => {
    await onSave(stored.filter((e) => e.id !== id));
  };

  return (
    <>
      <div
        className='fixed inset-0 z-[45] bg-black/40 no-print'
        onClick={onClose}
      />
      <aside
        style={{ width: panelW, maxWidth: "100vw" }}
        className='fixed top-0 right-0 bottom-0 z-50 w-full sm:w-auto bg-[var(--color-bg)] border-l border-[var(--color-border)] shadow-2xl no-print flex flex-col'
      >
        {/* Resize handle (desktop), drag left edge to widen */}
        <div
          onPointerDown={onResizeDown}
          className='hidden sm:block absolute left-0 top-0 bottom-0 w-2 -translate-x-1/2 cursor-ew-resize z-20 group'
          title='Drag to resize'
        >
          <div className='absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-transparent group-hover:bg-[var(--color-accent)] transition-colors' />
        </div>
        <header className='flex items-center justify-between gap-3 px-4 h-12 border-b border-[var(--color-border)] shrink-0'>
          <div className='flex items-center gap-2 min-w-0'>
            <Zap size={16} className='text-[var(--color-ink-soft)] shrink-0' />
            <span className='font-display text-base text-[var(--color-ink)] truncate'>
              Electric guitar voicings
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

        <div className='flex-1 overflow-y-auto p-3 space-y-2'>
          {rendered.length === 0 && editingId !== "new" && (
            <div className='text-xs text-[var(--color-ink-muted)] italic text-center py-8'>
              No voicings yet.
              <br />
              Add a chord voicing or a lick/run.
            </div>
          )}

          {groupBySection(rendered).map(({ section, entries }) => (
            <section key={section} className='space-y-1.5'>
              <h3 className='text-[10px] font-bold uppercase tracking-wider text-[var(--color-accent)] px-1 pt-1'>
                {section === UNSECTIONED ? "No section" : section}
              </h3>
              {entries.map((entry) =>
                editingId === entry.id ? (
                  <EntryEditor
                    key={entry.id}
                    draft={draft}
                    setDraft={setDraft}
                    originalKey={song.original_key}
                    onSave={saveEntry}
                    onSaveAndAdd={() => saveEntry(true)}
                    onCancel={cancelEdit}
                  />
                ) : (
                  <EntryCard
                    key={entry.id}
                    entry={entry}
                    onEdit={() => startEdit(entry)}
                    onDelete={() => deleteEntry(entry.id)}
                  />
                ),
              )}
            </section>
          ))}

          {editingId === "new" && (
            <EntryEditor
              draft={draft}
              setDraft={setDraft}
              originalKey={song.original_key}
              onSave={saveEntry}
              onSaveAndAdd={() => saveEntry(true)}
              onCancel={cancelEdit}
            />
          )}
        </div>

        <footer className='border-t border-[var(--color-border)] px-3 py-2 shrink-0 space-y-1'>
          {editingId !== "new" && (
            <div className='flex gap-1'>
              <Button
                variant='primary'
                size='sm'
                onClick={startAddChord}
                className='flex-1'
              >
                <Plus size={13} /> Chord
              </Button>
              <Button
                variant='primary'
                size='sm'
                onClick={startAddLick}
                className='flex-1'
              >
                <Plus size={13} /> Lick / Run
              </Button>
            </div>
          )}
          {semitones !== 0 && (
            <p className='text-[10px] text-[var(--color-ink-muted)] italic text-center'>
              Live transposition. Save key on main page to persist.
            </p>
          )}
        </footer>
      </aside>
    </>
  );
}

// ─── Entry card display ───────────────────────────────────────────────────

function EntryCard({ entry, onEdit, onDelete }) {
  const type = entryType(entry);
  const [confirmDelete, setConfirmDelete] = useState(false);
  return (
    <article className='p-2 border border-[var(--color-border)] rounded bg-[var(--color-bg-warm)]'>
      <div className='flex items-start justify-between gap-2 mb-1'>
        <div className='flex items-center gap-1.5 min-w-0'>
          <span className='text-[9px] uppercase tracking-wide px-1 py-0.5 rounded bg-[var(--color-bg)] text-[var(--color-ink-soft)]'>
            {type}
          </span>
          {type === "chord" && (
            <span className='font-mono text-sm font-bold text-[var(--color-ink)] truncate'>
              {entry.chord}
            </span>
          )}
        </div>
        <div className='flex items-center gap-0.5 shrink-0'>
          {confirmDelete ? (
            <>
              <span className='text-[10px] text-red-500 mr-0.5'>Delete?</span>
              <button
                onClick={onDelete}
                className='p-1 rounded hover:bg-[var(--color-bg)] text-red-500'
                title='Confirm delete'
              >
                <Check size={12} />
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className='p-1 rounded hover:bg-[var(--color-bg)] text-[var(--color-ink-soft)]'
                title='Cancel'
              >
                <X size={12} />
              </button>
            </>
          ) : (
            <>
              <button
                onClick={onEdit}
                className='p-1 rounded hover:bg-[var(--color-bg)] text-[var(--color-ink-soft)]'
                title='Edit'
              >
                <Edit3 size={12} />
              </button>
              <button
                onClick={() => setConfirmDelete(true)}
                className='p-1 rounded hover:bg-[var(--color-bg)] text-red-500'
                title='Delete'
              >
                <Trash2 size={12} />
              </button>
            </>
          )}
        </div>
      </div>

      {type === "chord" ? (
        <div className='flex items-start gap-2'>
          <div className='shrink-0' style={{ width: 120 }}>
            <FretboardDiagram
              frets={entry.frets}
              width={120}
              highlightRoot
              chordName={entry.chord}
            />
          </div>
          <div className='flex-1 min-w-0'>
            <div className='font-mono text-[11px] font-medium text-[var(--color-ink-soft)]'>
              {entry.frets.map((f) => (f == null ? "x" : f)).join(" ")}
            </div>
            {entry.label && (
              <p className='text-xs text-[var(--color-ink-soft)] mt-1 break-words'>
                {entry.label}
              </p>
            )}
          </div>
        </div>
      ) : (
        <>
          <LickTabStrip notes={entry.notes || []} />
          {entry.label && (
            <p className='text-xs text-[var(--color-ink-soft)] mt-1 break-words'>
              {entry.label}
            </p>
          )}
        </>
      )}
    </article>
  );
}

// ─── Editor, branches on draft.type ──────────────────────────────────────

function EntryEditor({
  draft,
  setDraft,
  _originalKey,
  onSave,
  onSaveAndAdd,
  onCancel,
}) {
  const type = entryType(draft);
  const isNew = draft.id === "new";
  const saveDisabled =
    type === "chord"
      ? !draft.chord?.trim()
      : parseLickText(draft.lickText || "").length === 0;
  return (
    <article className='p-2 border border-[var(--color-accent)] rounded bg-[var(--color-bg-warm)] space-y-2'>
      <div className='flex items-center gap-1'>
        <span className='text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-[var(--color-accent)] text-white'>
          {type === "lick" ? "Lick / Run" : "Chord"}
        </span>
      </div>

      {type === "chord" ? (
        <ChordEditor draft={draft} setDraft={setDraft} />
      ) : (
        <LickEditor draft={draft} setDraft={setDraft} />
      )}

      <div>
        <span className='text-[10px] text-[var(--color-ink-muted)] uppercase tracking-wide block mb-1'>
          Section
        </span>
        <input
          type='text'
          list='cv-section-presets'
          placeholder='e.g. Verse 1, Chorus'
          value={draft.section || ""}
          onChange={(e) => setDraft({ ...draft, section: e.target.value })}
          className='w-full h-7 px-2 text-xs border border-[var(--color-border)] rounded bg-[var(--color-bg)] text-[var(--color-ink)]'
        />
        <datalist id='cv-section-presets'>
          {SECTION_PRESETS.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </div>

      <Input
        placeholder='Notes (optional), extra detail'
        value={draft.label || ""}
        onChange={(e) => setDraft({ ...draft, label: e.target.value })}
        className='h-7 text-xs'
      />

      <div className='flex justify-end gap-1'>
        <Button variant='ghost' size='sm' onClick={onCancel}>
          Cancel
        </Button>
        {isNew && onSaveAndAdd && (
          <Button
            variant='ghost'
            size='sm'
            onClick={onSaveAndAdd}
            disabled={saveDisabled}
            title='Save and start another'
          >
            <Plus size={12} /> Save &amp; add
          </Button>
        )}
        <Button
          variant='primary'
          size='sm'
          onClick={onSave}
          disabled={saveDisabled}
        >
          <Check size={12} /> Save
        </Button>
      </div>
    </article>
  );
}

// ─── Chord editor: click-grid + catalog picker ────────────────────────────

function ChordEditor({ draft, setDraft }) {
  const suggestions = useMemo(() => {
    const ch = draft.chord?.trim();
    if (!ch) return [];
    return voicingsForChord(ch).slice(0, 8);
  }, [draft.chord]);

  const setFret = (stringIdx, val) => {
    const next = [...draft.frets];
    next[stringIdx] = val;
    setDraft({ ...draft, frets: next });
  };

  return (
    <>
      <Input
        placeholder='Chord (e.g. Am7, F#m, D/F#)'
        value={draft.chord || ""}
        onChange={(e) => setDraft({ ...draft, chord: e.target.value })}
        className='h-8 text-sm'
        autoFocus
      />

      <VoicingGrid frets={draft.frets} onSetFret={setFret} />

      {suggestions.length > 0 && (
        <div>
          <span className='text-[10px] text-[var(--color-ink-muted)] uppercase tracking-wide block mb-1'>
            Pick from catalog
          </span>
          <div className='flex gap-1 overflow-x-auto pb-1'>
            {suggestions.map((s, i) => (
              <button
                key={i}
                onClick={() => setDraft({ ...draft, frets: s.frets.slice() })}
                className='shrink-0 border border-[var(--color-border)] rounded hover:border-[var(--color-accent)] p-1 bg-[var(--color-bg)]'
                title={`Use ${s.frets.map((f) => (f == null ? "x" : f)).join(" ")}`}
              >
                <FretboardDiagram
                  frets={s.frets}
                  width={70}
                  responsive={false}
                />
              </button>
            ))}
          </div>
        </div>
      )}

      {draft.chord?.trim() && draft.frets.some((f) => f != null) && (
        <div className='flex justify-center pt-1 border-t border-[var(--color-border)]'>
          <FretboardDiagram
            frets={draft.frets}
            width={130}
            highlightRoot
            chordName={draft.chord.trim()}
          />
        </div>
      )}
    </>
  );
}

// ─── Click-grid voicing builder ───────────────────────────────────────────

function VoicingGrid({ frets, onSetFret }) {
  const cellH = 18;
  const labelW = 18;
  const cellBase =
    "border border-[var(--color-border)] rounded flex items-center justify-center cursor-pointer transition-colors text-[10px] font-mono select-none";
  const activeCell =
    "bg-[var(--color-ink)] text-white border-[var(--color-ink)]";
  const idleCell =
    "bg-[var(--color-bg)] hover:bg-[var(--color-bg-warm)] text-[var(--color-ink-soft)]";
  const markerFret = (f) =>
    FRET_MARKER_SINGLE.has(f) || FRET_MARKER_DOUBLE.has(f);

  const Cell = ({ stringIdx, value, label, isMarker }) => {
    const active = frets[stringIdx] === value;
    return (
      <button
        type='button'
        onClick={() => onSetFret(stringIdx, active ? null : value)}
        className={`${cellBase} ${active ? activeCell : idleCell} w-full relative`}
        style={{ height: cellH }}
      >
        {isMarker && !active && (
          <span
            className='absolute rounded-full bg-[var(--color-ink-soft)] opacity-15 pointer-events-none'
            style={{ width: 5, height: 5 }}
          />
        )}
        <span className={active ? "" : "opacity-60"}>{label}</span>
      </button>
    );
  };

  const RowLabel = ({ children, bold }) => (
    <div
      style={{ width: labelW, height: cellH }}
      className={`flex items-center justify-center text-[10px] font-mono text-[var(--color-ink-muted)] ${bold ? "font-bold text-[var(--color-ink-soft)]" : ""}`}
    >
      {children}
    </div>
  );

  const StringRow = ({ value, displayLabel, isMarker }) => (
    <>
      <RowLabel>{displayLabel}</RowLabel>
      {STRING_LABELS.map((_, i) => (
        <Cell
          key={`${value}-${i}`}
          stringIdx={i}
          value={value}
          label={
            frets[i] === value
              ? value == null
                ? "×"
                : value === 0
                  ? "O"
                  : value
              : value == null
                ? "×"
                : value === 0
                  ? "O"
                  : ""
          }
          isMarker={isMarker}
        />
      ))}
    </>
  );

  const colStyle = {
    gridTemplateColumns: `${labelW}px repeat(6, minmax(0, 1fr))`,
  };

  return (
    <div>
      <span className='text-[10px] text-[var(--color-ink-muted)] uppercase tracking-wide block mb-1'>
        Build voicing, click cell to set fret per string · scroll for higher
        frets
      </span>
      {/* Fixed header + mute/open rows (always visible) */}
      <div className='grid gap-0.5' style={colStyle}>
        {/* header: blank + string labels */}
        <RowLabel />
        {STRING_LABELS.map((label, i) => (
          <div
            key={`hdr-${i}`}
            className='text-center text-[10px] font-mono font-bold text-[var(--color-ink-soft)]'
            style={{ height: cellH, lineHeight: `${cellH}px` }}
          >
            {label}
          </div>
        ))}
        {/* mute row */}
        <StringRow value={null} displayLabel='×' />
        {/* open row */}
        <StringRow value={0} displayLabel='0' />
      </div>
      {/* Scrollable fret rows 1..GRID_FRETS */}
      <div
        className='overflow-y-auto mt-0.5'
        style={{ maxHeight: cellH * 12 + 22 }}
      >
        <div className='grid gap-0.5' style={colStyle}>
          {Array.from({ length: GRID_FRETS }, (_, fIdx) => {
            const f = fIdx + 1;
            return (
              <StringRow
                key={`fr-${f}`}
                value={f}
                displayLabel={f}
                isMarker={markerFret(f)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Lick editor & tab strip ──────────────────────────────────────────────

// Parse free-text lick: letters E/A/D/G/B/e set current string. Numbers add notes.
// "G 4 6 8 9 B 5 7" → string G frets 4,6,8,9 then string B frets 5,7.
// Pair form "G:4". Slide "5/7" (up) or "7\5" (down). Bend "5b2" or "5b" (full=2).
const VALUE_RE = /^(\d+)(?:([/\\])(\d+)|b(\d*))?$/;

function parseValuePart(s) {
  const m = s.match(VALUE_RE);
  if (!m) return null;
  const fret = parseInt(m[1], 10);
  if (fret < 0 || fret > MAX_FRET_INPUT) return null;
  if (m[2]) {
    const to = parseInt(m[3], 10);
    if (to < 0 || to > MAX_FRET_INPUT || to === fret) return { fret };
    return { fret, slideTo: to };
  }
  if (m[4] !== undefined) {
    const bend = m[4] === "" ? 2 : parseInt(m[4], 10);
    if (bend < 1 || bend > 4) return null;
    return { fret, bend };
  }
  return { fret };
}

function parseLickText(text) {
  if (!text) return [];
  const notes = [];
  let currentString = 5; // default high e
  const tokens = text.replace(/[,;]/g, " ").split(/\s+/).filter(Boolean);
  const pairRe = new RegExp(`^(${STRING_LETTER_RE}):?(.+)$`);
  const letterRe = new RegExp(`^${STRING_LETTER_RE}$`);
  for (const tok of tokens) {
    if (letterRe.test(tok)) {
      currentString = STRING_INDEX[tok];
      continue;
    }
    let s = currentString;
    let val = tok;
    const pm = tok.match(pairRe);
    if (pm && STRING_INDEX[pm[1]] != null && /^\d/.test(pm[2])) {
      s = STRING_INDEX[pm[1]];
      val = pm[2];
      currentString = s;
    }
    const parsed = parseValuePart(val);
    if (parsed) notes.push({ string: s, ...parsed });
  }
  return notes;
}

function noteValueText(n) {
  if (n.slideTo != null)
    return `${n.fret}${n.slideTo > n.fret ? "/" : "\\"}${n.slideTo}`;
  if (n.bend != null) return `${n.fret}b${n.bend === 2 ? "" : n.bend}`;
  return String(n.fret);
}

function notesToText(notes) {
  if (!notes || notes.length === 0) return "";
  let out = "";
  let prevString = null;
  for (const n of notes) {
    const v = noteValueText(n);
    if (n.string !== prevString) {
      out += (out ? " " : "") + STRING_LABELS[n.string] + " " + v;
      prevString = n.string;
    } else {
      out += " " + v;
    }
  }
  return out;
}

function LickEditor({ draft, setDraft }) {
  const notes = useMemo(
    () => parseLickText(draft.lickText || ""),
    [draft.lickText],
  );

  const updateNotes = (newNotes) => {
    setDraft({ ...draft, lickText: notesToText(newNotes) });
  };
  const addNote = (string, fret) => updateNotes([...notes, { string, fret }]);
  const addSlide = (string, fret, slideTo) =>
    updateNotes([...notes, { string, fret, slideTo }]);
  const addBend = (string, fret, bend) =>
    updateNotes([...notes, { string, fret, bend }]);
  const updateNote = (idx, patch) => {
    const next = notes.map((n, i) => {
      if (i !== idx) return n;
      const merged = { ...n, ...patch };
      if (merged.slideTo != null && merged.slideTo === merged.fret)
        delete merged.slideTo;
      return merged;
    });
    updateNotes(next);
  };
  const removeAt = (idx) => updateNotes(notes.filter((_, i) => i !== idx));
  const undoLast = () => updateNotes(notes.slice(0, -1));
  const clearLick = () => setDraft({ ...draft, lickText: "" });

  return (
    <>
      <FretboardClickGrid
        notes={notes}
        onAdd={addNote}
        onAddSlide={addSlide}
        onAddBend={addBend}
        onUpdateNote={updateNote}
        onRemoveAt={removeAt}
        onUndo={undoLast}
      />

      <div>
        <span className='text-[10px] text-[var(--color-ink-muted)] uppercase tracking-wide block mb-1'>
          Or type, letter sets string, numbers = frets. Slide: <code>5/7</code>{" "}
          or <code>7\5</code>. Bend: <code>5b</code> (full) or <code>5b1</code>{" "}
          (half)
        </span>
        <textarea
          value={draft.lickText || ""}
          onChange={(e) => setDraft({ ...draft, lickText: e.target.value })}
          placeholder='G 4 6 8 9 B 5 7 10'
          className='w-full h-14 px-2 py-1 text-sm font-mono border border-[var(--color-border)] rounded bg-[var(--color-bg)] text-[var(--color-ink)] resize-y'
        />
        {(draft.lickText || "").length > 0 && (
          <button
            type='button'
            onClick={clearLick}
            className='text-[10px] text-[var(--color-ink-muted)] hover:text-red-500 mt-1'
          >
            Clear all
          </button>
        )}
      </div>

      {notes.length > 0 && (
        <div className='pt-1 border-t border-[var(--color-border)]'>
          <span className='text-[10px] text-[var(--color-ink-muted)] uppercase tracking-wide block mb-1'>
            Preview ({notes.length} note{notes.length === 1 ? "" : "s"})
          </span>
          <LickTabStrip notes={notes} />
        </div>
      )}
    </>
  );
}

// ─── Scrollable fretboard click grid ──────────────────────────────────────
// Frets 0..23 across, 6 strings (high e top → low E bottom).
// Click cell = append note to sequence. Hover existing cell → × to remove last occurrence.
// Undo button removes most recent in sequence.

const HEADER_H = 20;
const DRAG_PX_THRESHOLD = 6;

function SlideHandle({
  noteIdx,
  n,
  cxOf,
  cyOf,
  cellW,
  labelW,
  gridRef,
  onUpdate,
}) {
  const draggingRef = useRef(false);
  const [hover, setHover] = useState(false);

  function clientToFret(clientX) {
    const r = gridRef.current?.getBoundingClientRect();
    if (!r) return null;
    const x = clientX - r.left - labelW;
    return Math.max(0, Math.min(TOTAL_FRETS - 1, Math.floor(x / cellW)));
  }

  return (
    <circle
      cx={cxOf(n.slideTo)}
      cy={cyOf(n.string)}
      r={hover ? 8 : 6}
      fill='var(--color-accent)'
      stroke='white'
      strokeWidth={1.5}
      style={{ cursor: "ew-resize", pointerEvents: "auto" }}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      onPointerDown={(e) => {
        e.stopPropagation();
        e.preventDefault();
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {}
        draggingRef.current = true;
      }}
      onPointerMove={(e) => {
        if (!draggingRef.current) return;
        const f = clientToFret(e.clientX);
        if (f != null && f !== n.slideTo) onUpdate(noteIdx, { slideTo: f });
      }}
      onPointerUp={(e) => {
        draggingRef.current = false;
        try {
          e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {}
      }}
      onPointerCancel={() => {
        draggingRef.current = false;
      }}
    >
      <title>Drag to change slide endpoint</title>
    </circle>
  );
}

function FretboardClickGrid({
  notes,
  onAdd,
  onAddSlide,
  onAddBend,
  onUpdateNote,
  onRemoveAt,
  onUndo,
}) {
  const cellW = 36;
  const cellH = 28;
  const labelW = 22;
  const gridRef = useRef(null);
  const dragRef = useRef(null);
  const [drag, setDrag] = useState(null); // { start:{stringIdx,fret,rowIdx}, current:{...}, kind:'slide'|'bend'|null }

  const occurrencesAt = useMemo(() => {
    const m = new Map();
    notes.forEach((n, idx) => {
      const k = `${n.string}-${n.fret}`;
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(idx);
    });
    return m;
  }, [notes]);

  const removeLastAt = (s, f) => {
    for (let i = notes.length - 1; i >= 0; i--) {
      if (notes[i].string === s && notes[i].fret === f) {
        onRemoveAt(i);
        return;
      }
    }
  };

  function cellFromPointer(clientX, clientY) {
    const el = gridRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const x = clientX - r.left - labelW;
    const y = clientY - r.top - HEADER_H;
    const fret = Math.floor(x / cellW);
    const rowIdx = Math.floor(y / cellH);
    if (fret < 0 || fret >= TOTAL_FRETS || rowIdx < 0 || rowIdx > 5)
      return null;
    return {
      stringIdx: STRING_DISPLAY_ORDER[rowIdx],
      fret,
      rowIdx,
      clientX,
      clientY,
    };
  }

  function classifyDrag(start, current) {
    const dxPx = current.clientX - start.clientX;
    const dyPx = current.clientY - start.clientY;
    if (
      Math.abs(dxPx) < DRAG_PX_THRESHOLD &&
      Math.abs(dyPx) < DRAG_PX_THRESHOLD
    )
      return { kind: null };
    const dFret = current.fret - start.fret;
    const dRow = current.rowIdx - start.rowIdx;
    // Bend: vertical-dominant upward drag on same start fret
    if (dyPx < -DRAG_PX_THRESHOLD && Math.abs(dyPx) > Math.abs(dxPx)) {
      const semi = Math.min(Math.max(-dRow, 1), 3);
      return { kind: "bend", semitones: semi };
    }
    // Slide: horizontal drag on same string
    if (dFret !== 0 && dRow === 0) {
      return {
        kind: "slide",
        from: start.fret,
        to: current.fret,
        stringIdx: start.stringIdx,
      };
    }
    return { kind: null };
  }

  function handlePointerDown(e) {
    if (e.button !== 0) return;
    if (e.target.closest("[data-no-drag]")) return;
    const cell = cellFromPointer(e.clientX, e.clientY);
    if (!cell) return;
    e.preventDefault();
    dragRef.current = { start: cell, current: cell };
    setDrag({ start: cell, current: cell, kind: null });
    try {
      gridRef.current.setPointerCapture(e.pointerId);
    } catch {}
  }

  function handlePointerMove(e) {
    if (!dragRef.current) return;
    const cell = cellFromPointer(e.clientX, e.clientY) || {
      stringIdx: dragRef.current.start.stringIdx,
      fret: dragRef.current.start.fret,
      rowIdx: dragRef.current.start.rowIdx,
      clientX: e.clientX,
      clientY: e.clientY,
    };
    dragRef.current.current = cell;
    setDrag({
      ...dragRef.current,
      kind: classifyDrag(dragRef.current.start, cell).kind,
    });
  }

  function handlePointerUp(e) {
    if (!dragRef.current) return;
    const { start, current } = dragRef.current;
    const cls = classifyDrag(start, current);
    if (cls.kind === "slide") {
      onAddSlide(cls.stringIdx, cls.from, cls.to);
    } else if (cls.kind === "bend") {
      onAddBend(start.stringIdx, start.fret, cls.semitones);
    } else {
      onAdd(start.stringIdx, start.fret);
    }
    dragRef.current = null;
    setDrag(null);
    try {
      gridRef.current.releasePointerCapture(e.pointerId);
    } catch {}
  }

  function handlePointerCancel() {
    dragRef.current = null;
    setDrag(null);
  }

  // Overlay positions
  const overlayW = TOTAL_FRETS * cellW;
  const overlayH = 6 * cellH;
  const cxOf = (fret) => fret * cellW + cellW / 2;
  const cyOf = (stringIdx) => {
    const row = STRING_DISPLAY_ORDER.indexOf(stringIdx);
    return row * cellH + cellH / 2;
  };

  return (
    <div className='space-y-1'>
      <div className='flex items-center justify-between gap-2'>
        <span className='text-[10px] text-[var(--color-ink-muted)] uppercase tracking-wide leading-tight'>
          Click = note · drag horizontal = slide · drag up = bend · drag
          endpoint to adjust
        </span>
        <button
          type='button'
          onClick={onUndo}
          disabled={notes.length === 0}
          className='text-[10px] px-2 py-0.5 rounded border border-[var(--color-border)] hover:bg-[var(--color-bg-warm)] disabled:opacity-40 disabled:cursor-not-allowed shrink-0'
        >
          Undo last
        </button>
      </div>

      <div
        className='overflow-x-auto border border-[var(--color-border)] rounded bg-[var(--color-bg)]'
        style={{ maxWidth: "100%" }}
      >
        <div
          ref={gridRef}
          style={{
            width: "max-content",
            position: "relative",
            touchAction: "none",
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
        >
          {/* Fret number header row */}
          <div className='flex' style={{ height: HEADER_H }}>
            <div style={{ width: labelW }} />
            {Array.from({ length: TOTAL_FRETS }, (_, f) => {
              const isMarker =
                f === 0 ||
                FRET_MARKER_SINGLE.has(f) ||
                FRET_MARKER_DOUBLE.has(f);
              return (
                <div
                  key={f}
                  style={{ width: cellW, lineHeight: `${HEADER_H}px` }}
                  className='text-center text-[11px] font-mono text-[var(--color-ink-muted)]'
                >
                  {isMarker ? (f === 12 ? "12" : f) : ""}
                </div>
              );
            })}
          </div>

          {/* 6 string rows, high e to low E */}
          {STRING_DISPLAY_ORDER.map((stringIdx, rowIdx) => {
            const isFirstRow = rowIdx === 0;
            const isLastRow = rowIdx === 5;
            return (
              <div
                key={stringIdx}
                className='flex items-center'
                style={{ height: cellH }}
              >
                <div
                  style={{ width: labelW }}
                  className='text-center text-[12px] font-mono font-bold text-[var(--color-ink-soft)]'
                >
                  {STRING_LABELS[stringIdx]}
                </div>
                {Array.from({ length: TOTAL_FRETS }, (_, f) => {
                  const occIdxs = occurrencesAt.get(`${stringIdx}-${f}`) || [];
                  const occNotes = occIdxs.map((i) => notes[i]);
                  return (
                    <FretCell
                      key={f}
                      width={cellW}
                      height={cellH}
                      fret={f}
                      stringIdx={stringIdx}
                      isMiddleRow={rowIdx === 2 || rowIdx === 3}
                      occurrences={occIdxs}
                      occNotes={occNotes}
                      isTopBorder={isFirstRow}
                      isBottomBorder={isLastRow}
                      onRemove={() => removeLastAt(stringIdx, f)}
                    />
                  );
                })}
              </div>
            );
          })}

          {/* Decoration overlay: slides + bends */}
          <svg
            style={{
              position: "absolute",
              top: HEADER_H,
              left: labelW,
              width: overlayW,
              height: overlayH,
              pointerEvents: "none",
            }}
          >
            <defs>
              <marker
                id='cv-arrow'
                viewBox='0 0 10 10'
                refX='9'
                refY='5'
                markerWidth='6'
                markerHeight='6'
                orient='auto-start-reverse'
              >
                <path d='M0,0 L10,5 L0,10 z' fill='var(--color-accent)' />
              </marker>
            </defs>
            {notes.map((n, idx) => {
              const x1 = cxOf(n.fret);
              const y = cyOf(n.string);
              if (n.slideTo != null) {
                const x2 = cxOf(n.slideTo);
                return (
                  <g key={`sl-${idx}`}>
                    <line
                      x1={x1}
                      y1={y}
                      x2={x2}
                      y2={y}
                      stroke='var(--color-accent)'
                      strokeWidth={2}
                      strokeLinecap='round'
                      markerEnd='url(#cv-arrow)'
                      opacity={0.85}
                    />
                    <SlideHandle
                      noteIdx={idx}
                      n={n}
                      cxOf={cxOf}
                      cyOf={cyOf}
                      cellW={cellW}
                      labelW={labelW}
                      gridRef={gridRef}
                      onUpdate={onUpdateNote}
                    />
                  </g>
                );
              }
              if (n.bend != null) {
                const bx = x1;
                const by = y;
                const top = by - cellH * 0.7;
                const label =
                  n.bend === 1
                    ? "½"
                    : n.bend === 2
                      ? "full"
                      : n.bend === 3
                        ? "1½"
                        : `${n.bend}`;
                return (
                  <g key={`bn-${idx}`} opacity={0.9}>
                    <path
                      d={`M ${bx} ${by} Q ${bx + 10} ${(by + top) / 2} ${bx + 14} ${top}`}
                      fill='none'
                      stroke='var(--color-accent)'
                      strokeWidth={2}
                      strokeLinecap='round'
                      markerEnd='url(#cv-arrow)'
                    />
                    <text
                      x={bx + 16}
                      y={top + 3}
                      fontSize={9}
                      fontFamily='ui-monospace, monospace'
                      fontWeight='700'
                      fill='var(--color-accent)'
                    >
                      {label}
                    </text>
                  </g>
                );
              }
              return null;
            })}
            {/* Live drag preview */}
            {drag && drag.kind === "slide" && (
              <line
                x1={cxOf(drag.start.fret)}
                y1={cyOf(drag.start.stringIdx)}
                x2={cxOf(drag.current.fret)}
                y2={cyOf(drag.start.stringIdx)}
                stroke='var(--color-accent)'
                strokeWidth={2}
                strokeDasharray='3 2'
                opacity={0.6}
              />
            )}
            {drag && drag.kind === "bend" && (
              <line
                x1={cxOf(drag.start.fret)}
                y1={cyOf(drag.start.stringIdx)}
                x2={cxOf(drag.start.fret)}
                y2={cyOf(drag.start.stringIdx) - cellH * 0.7}
                stroke='var(--color-accent)'
                strokeWidth={2}
                strokeDasharray='3 2'
                opacity={0.6}
              />
            )}
          </svg>
        </div>
      </div>
    </div>
  );
}

function FretCell({
  width,
  height,
  fret,
  _stringIdx,
  isMiddleRow,
  occurrences,
  occNotes,
  isTopBorder,
  _isBottomBorder,
  onRemove,
}) {
  const [hover, setHover] = useState(false);
  const hasNote = occurrences.length > 0;
  const isOpenCol = fret === 0;
  const isNut = fret === 0;
  const isMarkerFret =
    !isOpenCol &&
    (FRET_MARKER_SINGLE.has(fret) || FRET_MARKER_DOUBLE.has(fret));

  // 1-based sequence numbers shown to user
  const seqLabels = occurrences.map((i) => i + 1);
  const seqText =
    seqLabels.length > 2
      ? `${seqLabels[0]}+${seqLabels.length - 1}`
      : seqLabels.join(",");
  const anySlide = occNotes?.some((n) => n?.slideTo != null);
  const anyBend = occNotes?.some((n) => n?.bend != null);

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width,
        height,
        borderRight: isNut
          ? "3px solid var(--color-ink)"
          : "1px solid var(--color-border)",
        borderTop: isTopBorder ? "1px solid var(--color-border)" : "none",
        borderBottom: "1px solid var(--color-border)",
        borderLeft: fret === 0 ? "1px solid var(--color-border)" : "none",
        background: hover && !hasNote ? "var(--color-bg-warm)" : "transparent",
      }}
      className='relative cursor-pointer select-none flex items-center justify-center'
    >
      {/* Fret marker dot, show in middle rows only, behind notes */}
      {isMarkerFret && isMiddleRow && !hasNote && (
        <span
          className='absolute rounded-full bg-[var(--color-ink-soft)] opacity-20 pointer-events-none'
          style={{ width: 6, height: 6 }}
        />
      )}

      {hasNote && (
        <span
          className={`text-white text-[11px] font-mono font-bold rounded-full px-1.5 leading-none flex items-center justify-center ${anyBend ? "ring-1 ring-amber-300" : ""}`}
          style={{
            minWidth: 20,
            height: 20,
            background: "var(--color-accent)",
          }}
          title={anySlide ? "slide" : anyBend ? "bend" : ""}
        >
          {seqText}
        </span>
      )}

      {hasNote && hover && (
        <button
          type='button'
          data-no-drag
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className='absolute -top-1.5 -right-1.5 bg-red-500 hover:bg-red-600 text-white rounded-full text-[11px] leading-none flex items-center justify-center shadow z-10'
          style={{ width: 16, height: 16 }}
          title='Remove last note at this fret'
        >
          ×
        </button>
      )}
    </div>
  );
}

// Horizontal tab strip, 6 horizontal lines, notes plotted left→right.
// Long licks wrap onto multiple staves so notes stay big & legible.
// Reflows to the available width (panel resize aware) via ResizeObserver.
function LickTabStrip({ notes }) {
  const wrapRef = useRef(null);
  const [boxW, setBoxW] = useState(0);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width;
      if (w) setBoxW(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const labelText = (n) => {
    if (n.slideTo != null)
      return `${n.fret}${n.slideTo > n.fret ? "/" : "\\"}${n.slideTo}`;
    if (n.bend != null)
      return `${n.fret}b${n.bend === 1 ? "½" : n.bend === 2 ? "" : n.bend}`;
    return String(n.fret);
  };

  if (!notes || notes.length === 0) {
    return (
      <div
        ref={wrapRef}
        className='text-xs text-[var(--color-ink-soft)] italic'
      >
        No notes
      </div>
    );
  }

  const labelW = 20;
  const padX = 8;
  const padY = 16;
  const stringSpacing = 16;
  const minSlot = 34; // min px per note → stays readable
  const staffH = padY * 2 + stringSpacing * 5;
  const rowGap = 16;

  // 420 fallback ≈ default panel content width (avoids first-paint flash before ResizeObserver fires)
  const avail = Math.max(boxW || 420, minSlot + labelW + padX * 2);
  const usable = avail - labelW - padX * 2;
  const perRow = Math.max(
    1,
    Math.min(notes.length, Math.floor(usable / minSlot)),
  );
  const slot = usable / perRow;

  const rows = [];
  for (let i = 0; i < notes.length; i += perRow)
    rows.push(notes.slice(i, i + perRow));

  const totalW = avail;
  const totalH = rows.length * staffH + (rows.length - 1) * rowGap;

  return (
    <div ref={wrapRef} style={{ width: "100%" }}>
      <svg
        viewBox={`0 0 ${totalW} ${totalH}`}
        width='100%'
        height={totalH}
        style={{ display: "block", overflow: "visible" }}
      >
        {rows.map((rowNotes, rowIdx) => {
          const baseY = rowIdx * (staffH + rowGap);
          return (
            <g key={`row-${rowIdx}`}>
              {STRING_LABELS.map((label, i) => {
                const y = baseY + padY + (5 - i) * stringSpacing;
                return (
                  <g key={`s-${rowIdx}-${i}`}>
                    <line
                      x1={labelW}
                      y1={y}
                      x2={totalW - padX}
                      y2={y}
                      stroke='var(--color-ink-soft)'
                      strokeWidth={0.6}
                    />
                    <text
                      x={2}
                      y={y + 3.5}
                      fontSize={10}
                      fill='var(--color-ink-soft)'
                      fontFamily='ui-monospace, monospace'
                    >
                      {label}
                    </text>
                  </g>
                );
              })}
              {rowNotes.map((n, col) => {
                const x = labelW + padX + col * slot + slot / 2;
                const y = baseY + padY + (5 - n.string) * stringSpacing;
                const text = labelText(n);
                const w = Math.max(18, text.length * 7 + 8);
                const isBend = n.bend != null;
                return (
                  <g key={`n-${rowIdx}-${col}`}>
                    <rect
                      x={x - w / 2}
                      y={y - 7}
                      width={w}
                      height={14}
                      rx={2}
                      fill='var(--color-bg)'
                      stroke={isBend ? "#d97706" : "var(--color-accent)"}
                      strokeWidth={1}
                    />
                    <text
                      x={x}
                      y={y + 4}
                      textAnchor='middle'
                      fontSize={10.5}
                      fontFamily='ui-monospace, monospace'
                      fill='var(--color-ink)'
                      fontWeight='700'
                    >
                      {text}
                    </text>
                    {isBend && (
                      <text
                        x={x + w / 2 + 2}
                        y={y - 4}
                        fontSize={8}
                        fill='#d97706'
                        fontFamily='ui-monospace, monospace'
                      >
                        ↑
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
