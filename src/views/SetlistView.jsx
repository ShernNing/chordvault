import React, { useState, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import {
  ArrowLeft,
  GripVertical,
  Plus,
  X,
  FileDown,
  Search,
  Edit3,
  Check,
  ChevronUp,
  ChevronDown,
  Music2,
  Eye,
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useSetlist, useSongs } from "../lib/hooks";
import { transposeKey, getCapoDisplay, ALL_KEYS, semitonesFromKeyToKey } from "../lib/transposition";
import { exportSetlistToPDF, createPrintContainer } from "../lib/pdf";
import { exportSetlistToDocx } from "../lib/docxExport";
import { PrintableSongSheet, MultiSongPage, SingleSongForColumn } from "../components/song/SongRenderer";
import SetlistFullEditor from "../components/setlist/SetlistFullEditor";
import {
  Button,
  Input,
  Badge,
  EmptyState,
  ErrorState,
  Skeleton,
  Select,
  Tooltip,
  Modal,
} from "../components/ui";

// Half-page column: (794 - 48px padding - 32px gap) / 2 = 357px ÷ ~7.2px/char ≈ 49 chars
// Use 45 as conservative threshold to ensure no overflow
const MAX_HALF_COL_CHARS = 45;

function getMaxLineChars(parsedContent) {
  let max = 0;
  for (const line of parsedContent || []) {
    let len = 0;
    if (line.type === 'chord_line') {
      len = line.tokens
        ? line.tokens.reduce((s, t) => s + (t.leadingSpaces || 0) + t.text.length, 0)
        : (line.raw || '').length;
    } else if (line.type === 'lyric_line') {
      len = (line.text || '').length;
    }
    if (len > max) max = len;
  }
  return max;
}

export default function SetlistView() {
  const { id } = useParams();

  if (!id) return <ErrorState message='Invalid setlist ID' />;

  const {
    setlist,
    loading,
    error,
    reload,
    addSong,
    removeSong,
    updateSlot,
    reorder,
    rename,
  } = useSetlist(id);
  const { songs: allSongs } = useSongs();

  const [searchQuery, setSearchQuery] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportingDocx, setExportingDocx] = useState(false);
  const [addPanelOpen, setAddPanelOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const printRefs = useRef({});

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  if (loading)
    return (
      <div className='max-w-5xl mx-auto space-y-4'>
        <Skeleton className='h-8 w-48' />
        <Skeleton className='h-64' />
      </div>
    );
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!setlist) return <ErrorState message='Setlist not found' />;

  const slots = setlist.songs || [];
  const slotIds = slots.map((s) => s.id);

  const handleDragEnd = async (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = slots.findIndex((s) => s.id === active.id);
    const newIndex = slots.findIndex((s) => s.id === over.id);
    const newOrder = arrayMove(slots, oldIndex, newIndex);
    await reorder(newOrder.map((s) => s.id));
  };

  const filteredSongs = allSongs.filter((song) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      song.title?.toLowerCase().includes(q) ||
      song.artist?.toLowerCase().includes(q)
    );
  });

  // Songs not already in this setlist
  const addableSongs = filteredSongs.filter(
    (song) => !slots.some((slot) => slot.song_id === song.id),
  );

  const handleExportPDF = async (slotsOverride) => {
    setExporting(true);
    try {
      const { createRoot } = await import("react-dom/client");
      const { flushSync } = await import("react-dom");
      const { semitonesFromKeyToKey } = await import("../lib/transposition");
      const containers = [];
      const roots = [];
      const exportSlots = Array.isArray(slotsOverride) ? slotsOverride : slots;

      const PAGE_COL_HEIGHT = 1087; // A4 (1123px) minus 12px top + 24px bottom padding
      const SONG_GAP = 16;          // vertical gap between songs in same column

      // Step 1: compute key/semitone data
      const rawSlotData = exportSlots
        .filter((slot) => slot.song)
        .map((slot, globalIdx) => {
          const semitones =
            slot.chosen_key && slot.song.original_key
              ? semitonesFromKeyToKey(slot.song.original_key, slot.chosen_key)
              : 0;
          const displayKey = slot.chosen_key || slot.song.original_key;
          const capo = slot.capo || 0;
          const shapeSemitones = semitones - capo;
          const shapeKey =
            capo > 0 && displayKey ? transposeKey(displayKey, -capo) : displayKey;
          const keyLabel = `${displayKey || ""}${capo > 0 ? ` (capo ${capo})` : ""}`;
          const maxChars = getMaxLineChars(slot.song.parsed_content);
          return { slot, shapeSemitones, shapeKey, keyLabel, maxChars, globalIdx };
        });

      // Step 2: DOM measurement — render each song at exact half-column width and
      // read scrollHeight. The browser layout engine handles font metrics and text
      // wrapping exactly, matching how the final PDF will be rendered.
      // Half-column: (794px - 2×24px wrapper padding - 32px column gap) / 2 = 357px
      const measureEl = document.createElement("div");
      measureEl.style.cssText =
        "position:absolute;top:-9999px;left:-9999px;width:357px;visibility:hidden;pointer-events:none;";
      document.body.appendChild(measureEl);
      const measureRoot = createRoot(measureEl);

      const slotData = rawSlotData.map((d) => {
        flushSync(() => {
          measureRoot.render(
            <SingleSongForColumn
              song={d.slot.song}
              semitones={d.shapeSemitones}
              targetKey={d.shapeKey}
              keyLabel={d.keyLabel}
              songNumber={d.globalIdx + 1}
            />
          );
        });
        const measuredH = measureEl.scrollHeight;
        // Width is a hard constraint (long lines can't wrap cleanly in half column).
        // Height is soft — a song slightly over PAGE_COL_HEIGHT still looks fine in a
        // half column and is far better than wasting a full page on a short companion.
        const fitsHalfPage = d.maxChars <= MAX_HALF_COL_CHARS;
        return { ...d, estimatedH: measuredH, fitsHalfPage };
      });

      measureRoot.unmount();
      document.body.removeChild(measureEl);

      // Bin-pack songs left-column-first; wide-line songs break packing to full width.
      const packedPages = [];
      let leftCol = [], rightCol = [], leftH = 0, rightH = 0;

      const flushMultiPage = () => {
        if (leftCol.length === 0) return;
        packedPages.push({ type: "multi", left: [...leftCol], right: [...rightCol] });
        leftCol = []; rightCol = []; leftH = 0; rightH = 0;
      };

      // Waterfall: fill left until full, then right until full, then flush.
      // Never go back to left once right has started — preserves song order.
      // First song always lands in left even if it overflows column height.
      let useRight = false;

      for (const d of slotData) {
        if (!d.fitsHalfPage || d.estimatedH > PAGE_COL_HEIGHT) {
          flushMultiPage();
          useRight = false;
          packedPages.push({ type: "single", data: d });
        } else {
          const h = d.estimatedH;
          if (!useRight) {
            const newLeftH = leftH + (leftH > 0 ? SONG_GAP : 0) + h;
            if (leftH === 0 || newLeftH <= PAGE_COL_HEIGHT) {
              leftCol.push(d);
              leftH = leftH === 0 ? h : newLeftH;
            } else {
              // Left has content and this doesn't fit — switch to right column
              useRight = true;
              rightCol.push(d);
              rightH = h;
            }
          } else {
            const newRightH = rightH + (rightH > 0 ? SONG_GAP : 0) + h;
            if (rightH === 0 || newRightH <= PAGE_COL_HEIGHT) {
              rightCol.push(d);
              rightH = rightH === 0 ? h : newRightH;
            } else {
              // Both columns full — flush, start new page
              flushMultiPage();
              useRight = false;
              leftCol.push(d);
              leftH = h;
            }
          }
        }
      }
      flushMultiPage();

      // Render each packed page
      for (const page of packedPages) {
        const container = createPrintContainer();
        const root = createRoot(container);

        const makeItems = (col) =>
          col.map((d) => ({
            song: d.slot.song,
            semitones: d.shapeSemitones,
            targetKey: d.shapeKey,
            keyLabel: d.keyLabel,
            songNumber: d.globalIdx + 1,
          }));

        if (page.type === "single") {
          // Wide-line songs always render full-width with internal 2-col if needed
          const d = page.data;
          root.render(
            <PrintableSongSheet
              song={d.slot.song}
              semitones={d.shapeSemitones}
              targetKey={d.shapeKey}
              keyLabel={d.keyLabel}
              songNumber={d.globalIdx + 1}
            />,
          );
        } else if (page.left.length === 1 && page.right.length === 0) {
          // Single narrow song alone on page — use PrintableSongSheet for internal
          // 2-col splitting if song is very long (> 45 non-blank lines)
          const d = page.left[0];
          root.render(
            <PrintableSongSheet
              song={d.slot.song}
              semitones={d.shapeSemitones}
              targetKey={d.shapeKey}
              keyLabel={d.keyLabel}
              songNumber={d.globalIdx + 1}
            />,
          );
        } else {
          root.render(
            <MultiSongPage
              leftColumn={makeItems(page.left)}
              rightColumn={makeItems(page.right)}
            />,
          );
        }

        containers.push(container);
        roots.push(root);
      }

      await new Promise((r) => setTimeout(r, 400));
      await exportSetlistToPDF(setlist.name, containers);

      roots.forEach((r) => {
        try {
          r.unmount();
        } catch {}
      });
      containers.forEach((c) => {
        try {
          document.body.removeChild(c);
        } catch {}
      });
    } catch (e) {
      console.error("PDF export error:", e);
    } finally {
      setExporting(false);
    }
  };

  const handleExportDocx = async (slotsOverride) => {
    setExportingDocx(true);
    try {
      const { semitonesFromKeyToKey } = await import("../lib/transposition");
      const exportSlots = Array.isArray(slotsOverride) ? slotsOverride : slots;
      await exportSetlistToDocx(setlist.name, exportSlots.filter(s => s.song), (slot) => {
        const semitones = slot.chosen_key && slot.song.original_key
          ? semitonesFromKeyToKey(slot.song.original_key, slot.chosen_key)
          : 0;
        const displayKey = slot.chosen_key || slot.song.original_key;
        const capo = slot.capo || 0;
        const shapeSemitones = semitones - capo;
        const shapeKey = capo > 0 && displayKey ? transposeKey(displayKey, -capo) : displayKey;
        const keyLabel = `${displayKey || ""}${capo > 0 ? ` (capo ${capo})` : ""}`;
        return { song: slot.song, semitones: shapeSemitones, targetKey: shapeKey, keyLabel };
      });
    } catch (e) {
      console.error("Docx export error:", e);
    } finally {
      setExportingDocx(false);
    }
  };

  const handleStartRename = () => {
    setNewName(setlist.name);
    setRenaming(true);
  };

  const handleRename = async () => {
    if (newName.trim()) await rename(newName.trim());
    setRenaming(false);
  };

  return (
    <div className='max-w-5xl mx-auto space-y-4'>
      {/* Breadcrumb */}
      <div className='flex items-center gap-2'>
        <Link
          to='/setlists'
          className='flex items-center gap-1 text-xs text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] transition-colors'
        >
          <ArrowLeft size={12} /> Setlists
        </Link>
      </div>

      {/* Header */}
      <div className='flex items-start justify-between gap-4'>
        <div className='flex items-center gap-2 min-w-0'>
          {renaming ? (
            <div className='flex items-center gap-2'>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleRename();
                  if (e.key === "Escape") setRenaming(false);
                }}
                className='text-xl font-display'
                autoFocus
              />
              <Button variant='primary' size='icon-sm' onClick={handleRename}>
                <Check size={13} />
              </Button>
              <Button
                variant='ghost'
                size='icon-sm'
                onClick={() => setRenaming(false)}
              >
                <X size={13} />
              </Button>
            </div>
          ) : (
            <div className='flex items-center gap-2'>
              <h1 className='font-display text-2xl text-[var(--color-ink)] truncate'>
                {setlist.name}
              </h1>
              <Button
                variant='ghost'
                size='icon-sm'
                onClick={handleStartRename}
                title='Rename setlist'
              >
                <Edit3 size={13} />
              </Button>
            </div>
          )}
        </div>
        <div className='flex items-center gap-2 shrink-0'>
          <Button
            variant='secondary'
            size='sm'
            onClick={() => setAddPanelOpen((o) => !o)}
          >
            <Plus size={13} /> Add song
          </Button>
          <Button
            variant='primary'
            size='sm'
            onClick={() => setPreviewOpen(true)}
            disabled={slots.length === 0}
          >
            <Eye size={13} /> Edit full setlist
          </Button>
          <Button
            variant='secondary'
            size='sm'
            onClick={handleExportPDF}
            loading={exporting}
          >
            <FileDown size={13} /> Export PDF
          </Button>
          <Button
            variant='secondary'
            size='sm'
            onClick={handleExportDocx}
            loading={exportingDocx}
          >
            <FileDown size={13} /> Export Word
          </Button>
        </div>
      </div>

      <div className='grid grid-cols-1 lg:grid-cols-3 gap-4'>
        {/* ── Left: Setlist ─────────────────────────────────────────── */}
        <div className='lg:col-span-2 space-y-2'>
          <div className='flex items-center justify-between'>
            <span className='text-xs text-[var(--color-ink-muted)] uppercase tracking-wide'>
              {slots.length} {slots.length === 1 ? "song" : "songs"}
            </span>
          </div>

          {slots.length === 0 ? (
            <EmptyState
              icon={Music2}
              title='No songs yet'
              description='Search and add songs from your library.'
              action={
                <Button
                  variant='secondary'
                  size='sm'
                  onClick={() => setAddPanelOpen(true)}
                >
                  <Plus size={13} /> Add song
                </Button>
              }
            />
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={slotIds}
                strategy={verticalListSortingStrategy}
              >
                <div className='space-y-2'>
                  {slots.map((slot, index) => (
                    <SortableSlot
                      key={slot.id}
                      slot={slot}
                      index={index}
                      onRemove={() => removeSong(slot.id)}
                      onUpdateSlot={(updates) => updateSlot(slot.id, updates)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>

        {/* ── Right: Add Song Panel ─────────────────────────────────── */}
        {addPanelOpen && (
          <div className='border border-[var(--color-border)] rounded-lg bg-[var(--color-bg-warm)] p-3 space-y-3 h-fit sticky top-20'>
            <div className='flex items-center justify-between'>
              <span className='text-xs font-semibold text-[var(--color-ink)] uppercase tracking-wide'>
                Add from library
              </span>
              <Button
                variant='ghost'
                size='icon-sm'
                onClick={() => setAddPanelOpen(false)}
              >
                <X size={13} />
              </Button>
            </div>
            <div className='relative'>
              <Search
                size={12}
                className='absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-ink-muted)] pointer-events-none'
              />
              <input
                type='text'
                placeholder='Search songs…'
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className='w-full h-8 pl-8 pr-3 text-xs bg-[var(--color-bg)] border border-[var(--color-border)] rounded text-[var(--color-ink)] placeholder-[var(--color-ink-muted)] hover:border-[var(--color-ink-muted)] focus:outline-none focus:border-[var(--color-ink)] transition-colors'
                autoFocus
              />
            </div>
            <div className='space-y-1 max-h-80 overflow-y-auto'>
              {addableSongs.length === 0 ? (
                <p className='text-xs text-[var(--color-ink-muted)] text-center py-4'>
                  {searchQuery
                    ? "No matching songs"
                    : "All songs already added"}
                </p>
              ) : (
                addableSongs.map((song) => (
                  <button
                    key={song.id}
                    onClick={() => addSong(song.id, song.original_key, 0)}
                    className='w-full text-left p-2.5 rounded border border-transparent hover:border-[var(--color-border)] hover:bg-[var(--color-bg)] transition-all group'
                  >
                    <div className='flex items-center justify-between'>
                      <span className='text-xs font-medium text-[var(--color-ink)] truncate'>
                        {song.title}
                      </span>
                      <div className='flex items-center gap-1.5 shrink-0 ml-2'>
                        {song.original_key && (
                          <Badge variant='key'>{song.original_key}</Badge>
                        )}
                        <Plus
                          size={11}
                          className='text-[var(--color-ink-muted)] group-hover:text-[var(--color-accent)] transition-colors'
                        />
                      </div>
                    </div>
                    {song.artist && (
                      <span className='text-[10px] text-[var(--color-ink-muted)]'>
                        {song.artist}
                      </span>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {previewOpen && (
        <SetlistFullEditor
          setlist={setlist}
          slots={slots}
          onClose={() => setPreviewOpen(false)}
          onReorder={reorder}
          handleExportPDF={handleExportPDF}
          handleExportDocx={handleExportDocx}
          exporting={exporting}
          exportingDocx={exportingDocx}
        />
      )}
    </div>
  );
}

// ─── Sortable Slot ─────────────────────────────────────────────────────────

function SortableSlot({ slot, index, onRemove, onUpdateSlot }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: slot.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
  };

  const [editingKey, setEditingKey] = useState(false);
  const [localKey, setLocalKey] = useState(
    slot.chosen_key || slot.song?.original_key || "",
  );
  const [localCapo, setLocalCapo] = useState(slot.capo || 0);

  const displayKey = localKey || slot.song?.original_key;
  const capoHint =
    displayKey && localCapo > 0 ? getCapoDisplay(displayKey, localCapo) : null;

  const handleKeyChange = (key) => {
    setLocalKey(key);
    onUpdateSlot({ chosen_key: key || null });
  };

  const handleCapoChange = (val) => {
    const c = Math.max(0, Math.min(12, Number(val) || 0));
    setLocalCapo(c);
    onUpdateSlot({ capo: c });
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`
        flex items-start gap-3 p-3 border border-[var(--color-border)] rounded-lg bg-[var(--color-bg)]
        transition-shadow group
        ${isDragging ? "shadow-lg opacity-90" : "hover:border-[var(--color-ink-muted)]"}
      `}
    >
      {/* Position number */}
      <div className='flex flex-col items-center gap-1 shrink-0 pt-0.5'>
        <span className='text-[10px] font-mono text-[var(--color-ink-muted)] w-4 text-center'>
          {index + 1}
        </span>
        {/* Drag handle */}
        <button
          className='text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] cursor-grab active:cursor-grabbing touch-none'
          {...attributes}
          {...listeners}
          title='Drag to reorder'
        >
          <GripVertical size={14} />
        </button>
      </div>

      {/* Song info */}
      <div className='flex-1 min-w-0'>
        <div className='flex items-start justify-between gap-2'>
          <div className='min-w-0'>
            <Link
              to={`/songs/${slot.song_id}`}
              className='text-sm font-semibold text-[var(--color-ink)] hover:underline truncate block'
            >
              {slot.song?.title || "Unknown song"}
            </Link>
            {slot.song?.artist && (
              <span className='text-[10px] text-[var(--color-ink-muted)]'>
                {slot.song.artist}
              </span>
            )}
          </div>
          <Button
            variant='ghost'
            size='icon-sm'
            onClick={onRemove}
            className='text-[var(--color-ink-muted)] hover:text-red-500 shrink-0'
            title='Remove from setlist'
          >
            <X size={13} />
          </Button>
        </div>

        {/* Key + Capo controls */}
        <div className='flex items-center gap-3 mt-2 flex-wrap'>
          <div className='flex items-center gap-1.5'>
            <span className='text-[10px] text-[var(--color-ink-muted)]'>
              Key
            </span>
            <Select
              value={displayKey || ""}
              onChange={(e) => handleKeyChange(e.target.value)}
              className='h-6 text-[11px] w-16 py-0'
            >
              <option value=''>—</option>
              {ALL_KEYS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </Select>
            {slot.song?.original_key &&
              displayKey !== slot.song.original_key && (
                <span className='text-[9px] text-[var(--color-ink-muted)]'>
                  orig: {slot.song.original_key}
                </span>
              )}
          </div>

          <div className='flex items-center gap-1.5'>
            <span className='text-[10px] text-[var(--color-ink-muted)]'>
              Capo
            </span>
            <div className='flex items-center gap-0.5'>
              <Button
                variant='ghost'
                size='xs'
                onClick={() => handleCapoChange(localCapo - 1)}
                disabled={localCapo <= 0}
                className='w-5 h-5 p-0'
              >
                <ChevronDown size={10} />
              </Button>
              <span className='w-5 text-center font-mono text-[11px] text-[var(--color-ink)]'>
                {localCapo}
              </span>
              <Button
                variant='ghost'
                size='xs'
                onClick={() => handleCapoChange(localCapo + 1)}
                disabled={localCapo >= 12}
                className='w-5 h-5 p-0'
              >
                <ChevronUp size={10} />
              </Button>
            </div>
          </div>

          {capoHint && (
            <span className='text-[9px] text-[var(--color-ink-muted)] font-mono hidden sm:inline'>
              {capoHint}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

