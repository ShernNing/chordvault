import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { useParams, Link } from "react-router-dom";
import { motion, AnimatePresence, ease } from "../lib/motion";
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
  PlayCircle,
  Clock,
  Share2,
  Link2,
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
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  useSetlist,
  useSongs,
  getSongSeconds,
  setSongSeconds,
  formatDuration,
} from "../lib/hooks";
import {
  transposeKey,
  getCapoDisplay,
  ALL_KEYS,
  semitonesFromKeyToKey,
} from "../lib/transposition";
import { createSetlistShare, shareUrl } from "../lib/shares";
import { exportSetlistToPDF, createPrintContainer } from "../lib/pdf";
import { exportSetlistToDocx } from "../lib/docxExport";
import {
  PrintPage,
  SongSheetBody,
  SingleSongForColumn,
  SegmentHeading,
  PRINT_TWO_COL_LINE_THRESHOLD,
} from "../components/song/SongRenderer";
import { packPages } from "../lib/pdfPacking";
import { numberSlots } from "../lib/setlistSegments";
import SetlistFullEditor from "../components/setlist/SetlistFullEditor";
import SetlistPerformer from "../components/setlist/SetlistPerformer";
import { useToast } from "../lib/toast";
import {
  Button,
  Input,
  Badge,
  EmptyState,
  ErrorState,
  Skeleton,
  Select,
} from "../components/ui";

// Half-page column: (794 - 48px padding - 32px gap) / 2 = 357px ÷ ~7.2px/char ≈ 49 chars
// Use 45 as conservative threshold to ensure no overflow
const MAX_HALF_COL_CHARS = 45;

function getMaxLineChars(parsedContent) {
  let max = 0;
  for (const line of parsedContent || []) {
    let len = 0;
    if (line.type === "chord_line") {
      len = line.tokens
        ? line.tokens.reduce(
            (s, t) => s + (t.leadingSpaces || 0) + t.text.length,
            0,
          )
        : (line.raw || "").length;
    } else if (line.type === "lyric_line") {
      len = (line.text || "").length;
    }
    if (len > max) max = len;
  }
  return max;
}

function countNonBlankLines(parsedContent) {
  return (parsedContent || []).filter((l) => l.type !== "blank").length;
}

export default function SetlistView() {
  const { id } = useParams();

  const {
    setlist,
    loading,
    error,
    reload,
    addSong,
    addDivider,
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
  const [performOpen, setPerformOpen] = useState(false);
  const [durations, setDurations] = useState({});
  const [sharing, setSharing] = useState(false);
  const [shareLink, setShareLink] = useState("");
  const [selected, setSelected] = useState(() => new Set()); // multi-select slot ids
  const [activeId, setActiveId] = useState(null); // slot currently being dragged
  const toast = useToast();

  const toggleSelect = (slotId) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(slotId) ? next.delete(slotId) : next.add(slotId);
      return next;
    });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // Seed per-song duration estimates (localStorage) so the setlist total reacts live.
  useEffect(() => {
    const songs = setlist?.songs || [];
    const next = {};
    for (const s of songs)
      if (s.song) next[s.song_id] = getSongSeconds(s.song_id);
    setDurations(next);
  }, [setlist?.songs]);

  // Drop selection entries for slots that no longer exist (e.g. removed songs).
  useEffect(() => {
    const ids = new Set((setlist?.songs || []).map((s) => s.id));
    setSelected((prev) => {
      const next = new Set([...prev].filter((sid) => ids.has(sid)));
      return next.size === prev.size ? prev : next;
    });
  }, [setlist?.songs]);

  if (!id) return <ErrorState message='Invalid setlist ID' />;
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
  // Per-segment song numbers (restart at 1 after each divider) for the list.
  const segmentNumbers = new Map();
  for (const e of numberSlots(slots))
    if (e.kind === "song") segmentNumbers.set(e.slot.id, e.songNumber);

  const totalSeconds = slots.reduce(
    (sum, s) =>
      s.song ? sum + (durations[s.song_id] ?? getSongSeconds(s.song_id)) : sum,
    0,
  );

  const handleDurationChange = (songId, seconds) => {
    setSongSeconds(songId, seconds);
    setDurations((d) => ({ ...d, [songId]: seconds }));
  };

  const handleShareSetlist = async () => {
    setSharing(true);
    try {
      const token = await createSetlistShare(setlist, slots);
      const url = shareUrl(token);
      setShareLink(url);
      try {
        await navigator.clipboard.writeText(url);
      } catch {
        /* clipboard blocked */
      }
      toast.success("Share link copied to clipboard");
    } catch (e) {
      toast.error(e.message || "Could not create share link");
    } finally {
      setSharing(false);
    }
  };

  // Whether the current drag carries a multi-selection group.
  const isGroupDrag =
    activeId != null && selected.has(activeId) && selected.size > 1;

  const handleDragStart = (event) => setActiveId(event.active.id);

  const handleDragEnd = async (event) => {
    const { active, over } = event;
    setActiveId(null);
    if (!over || active.id === over.id) return;
    const ids = slots.map((s) => s.id);
    // Move the whole selection only if the grabbed row is part of a >1 group;
    // otherwise it's a plain single-row move.
    const movingSet =
      selected.has(active.id) && selected.size > 1
        ? selected
        : new Set([active.id]);
    const newOrder = reorderWithSelection(ids, movingSet, active.id, over.id);
    setSelected(new Set()); // commit clears the selection
    await reorder(newOrder);
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
      const containers = [];
      const roots = [];
      const exportSlots = Array.isArray(slotsOverride) ? slotsOverride : slots;

      const PAGE_HEIGHT = 1087; // A4 (1123px) minus 12px top + 24px bottom padding
      const SONG_GAP = 16; // vertical gap between bands / stacked songs
      const HALF_COL_WIDTH = 357; // (746 content - 32 gap) / 2
      const FULL_WIDTH = 746; // 794 wrapper - 2×24 padding

      // Step 1: turn slots into ordered render data. numberSlots keeps segment
      // dividers and restarts song numbering at 1 after each one.
      const rawEntries = numberSlots(exportSlots).map((entry) => {
        if (entry.kind === "divider") {
          return {
            kind: "divider",
            label: entry.label,
            pageBreak: entry.pageBreak,
          };
        }
        const slot = entry.slot;
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
        const content = slot.song.parsed_content;
        return {
          kind: "song",
          maxChars: getMaxLineChars(content),
          nonBlankLines: countNonBlankLines(content),
          // Props consumed by the print components (SingleSongForColumn / SongSheetBody).
          props: {
            song: slot.song,
            semitones: shapeSemitones,
            targetKey: shapeKey,
            keyLabel,
            songNumber: entry.songNumber,
          },
        };
      });

      // Step 2: measure each entry at the width it will actually render, and
      // decide whether a song packs into a half-page column (narrow) or takes a
      // full-width band. The browser layout engine handles font metrics and
      // wrapping exactly, matching the final PDF.
      const measureEl = document.createElement("div");
      measureEl.style.cssText =
        "position:absolute;top:-9999px;left:-9999px;visibility:hidden;pointer-events:none;";
      document.body.appendChild(measureEl);
      const measureRoot = createRoot(measureEl);
      const measure = (width, node) => {
        measureEl.style.width = `${width}px`;
        flushSync(() => measureRoot.render(node));
        return measureEl.scrollHeight;
      };

      const items = rawEntries.map((d, id) => {
        if (d.kind === "divider") {
          const height = measure(FULL_WIDTH, <SegmentHeading label={d.label} />);
          return { id, isDivider: true, label: d.label, pageBreak: d.pageBreak, height };
        }
        // Narrow candidates fit a half column horizontally AND are short enough
        // that a single (unsplit) column is appropriate. Wide or long songs get
        // a full-width band with internal 2-col split when needed.
        const narrowCandidate =
          d.maxChars <= MAX_HALF_COL_CHARS &&
          d.nonBlankLines <= PRINT_TWO_COL_LINE_THRESHOLD;
        let fitsHalf, height;
        if (narrowCandidate) {
          const h = measure(
            HALF_COL_WIDTH,
            <SingleSongForColumn {...d.props} />,
          );
          if (h <= PAGE_HEIGHT) {
            fitsHalf = true;
            height = h;
          } else {
            // Narrow but taller than a whole column — render full width instead.
            fitsHalf = false;
            height = measure(FULL_WIDTH, <SongSheetBody {...d.props} />);
          }
        } else {
          fitsHalf = false;
          height = measure(FULL_WIDTH, <SongSheetBody {...d.props} />);
        }
        return { id, fitsHalf, height, ...d.props };
      });

      measureRoot.unmount();
      document.body.removeChild(measureEl);

      const pages = packPages(items, {
        pageHeight: PAGE_HEIGHT,
        gap: SONG_GAP,
      });

      // Render each page (an ordered stack of cols/full bands) into its own
      // print container.
      for (const page of pages) {
        const container = createPrintContainer();
        const root = createRoot(container);
        root.render(<PrintPage bands={page.bands} />);
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
      const exportSlots = Array.isArray(slotsOverride) ? slotsOverride : slots;
      await exportSetlistToDocx(
        setlist.name,
        exportSlots,
        (slot) => {
          const semitones =
            slot.chosen_key && slot.song.original_key
              ? semitonesFromKeyToKey(slot.song.original_key, slot.chosen_key)
              : 0;
          const displayKey = slot.chosen_key || slot.song.original_key;
          const capo = slot.capo || 0;
          const shapeSemitones = semitones - capo;
          const shapeKey =
            capo > 0 && displayKey
              ? transposeKey(displayKey, -capo)
              : displayKey;
          const keyLabel = `${displayKey || ""}${capo > 0 ? ` (capo ${capo})` : ""}`;
          return {
            song: slot.song,
            semitones: shapeSemitones,
            targetKey: shapeKey,
            keyLabel,
          };
        },
      );
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
        <div className='flex items-center gap-2 shrink-0 flex-wrap justify-end'>
          <Button
            variant='primary'
            size='sm'
            onClick={() => setPerformOpen(true)}
            disabled={slots.length === 0}
          >
            <PlayCircle size={13} /> Perform
          </Button>
          <Button
            variant='secondary'
            size='sm'
            onClick={() => setAddPanelOpen((o) => !o)}
          >
            <Plus size={13} /> Add song
          </Button>
          <Button
            variant='secondary'
            size='sm'
            onClick={() => addDivider("New segment", false)}
          >
            <Plus size={13} /> Add segment
          </Button>
          <Button
            variant='secondary'
            size='sm'
            onClick={() => setPreviewOpen(true)}
            disabled={slots.length === 0}
          >
            <Eye size={13} /> Edit full setlist
          </Button>
          <Button
            variant='secondary'
            size='sm'
            onClick={handleShareSetlist}
            loading={sharing}
            disabled={slots.length === 0}
          >
            {shareLink ? <Link2 size={13} /> : <Share2 size={13} />} Share
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

      {shareLink && (
        <div className='flex items-center gap-2 px-3 py-2 bg-[var(--color-accent-soft)] border border-[var(--color-border)] rounded-lg text-xs'>
          <Link2 size={13} className='text-[var(--color-accent)] shrink-0' />
          <span className='text-[var(--color-ink-soft)] shrink-0 hidden sm:inline'>
            Public link:
          </span>
          <input
            readOnly
            value={shareLink}
            onFocus={(e) => e.target.select()}
            className='flex-1 min-w-0 bg-transparent font-mono text-[var(--color-ink)] outline-none'
          />
          <Button
            variant='ghost'
            size='xs'
            onClick={() => {
              navigator.clipboard?.writeText(shareLink);
              toast.success("Copied");
            }}
          >
            Copy
          </Button>
        </div>
      )}

      <div className='grid grid-cols-1 lg:grid-cols-3 gap-4'>
        {/* ── Left: Setlist ─────────────────────────────────────────── */}
        <div className='lg:col-span-2 space-y-2'>
          <div className='flex items-center justify-between'>
            {selected.size > 0 ? (
              <span className='flex items-center gap-2 text-xs text-[var(--color-ink)]'>
                <span className='font-medium'>{selected.size} selected</span>
                <button
                  onClick={() => setSelected(new Set())}
                  className='text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] underline'
                >
                  Clear
                </button>
                <span className='text-[var(--color-ink-muted)] hidden sm:inline'>
                  · drag any one to move the group
                </span>
              </span>
            ) : (
              <span className='text-xs text-[var(--color-ink-muted)] uppercase tracking-wide'>
                {slots.length} {slots.length === 1 ? "song" : "songs"}
              </span>
            )}
            {slots.length > 0 && (
              <span
                className='flex items-center gap-1 text-xs text-[var(--color-ink-muted)] font-mono'
                title='Estimated total length'
              >
                <Clock size={11} /> ~{formatDuration(totalSeconds)}
              </span>
            )}
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
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={slotIds}
                strategy={verticalListSortingStrategy}
              >
                <div className='space-y-2'>
                  <AnimatePresence initial={false}>
                    {slots.map((slot, index) =>
                      slot.song_id == null ? (
                        <motion.div
                          key={slot.id}
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={ease}
                          style={{ overflow: "hidden" }}
                        >
                          <SortableDivider
                            slot={slot}
                            onUpdateSlot={(updates) =>
                              updateSlot(slot.id, updates)
                            }
                            onRemove={() => removeSong(slot.id)}
                          />
                        </motion.div>
                      ) : (
                      <motion.div
                        key={slot.id}
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={ease}
                        style={{ overflow: "hidden" }}
                      >
                        <SortableSlot
                          slot={slot}
                          index={index}
                          number={segmentNumbers.get(slot.id)}
                          seconds={
                            durations[slot.song_id] ??
                            getSongSeconds(slot.song_id)
                          }
                          selected={selected.has(slot.id)}
                          onToggleSelect={() => toggleSelect(slot.id)}
                          isGroupDrag={isGroupDrag}
                          groupCount={selected.size}
                          onDurationChange={(s) =>
                            handleDurationChange(slot.song_id, s)
                          }
                          onRemove={() => removeSong(slot.id)}
                          onUpdateSlot={(updates) =>
                            updateSlot(slot.id, updates)
                          }
                        />
                      </motion.div>
                    ))}
                  </AnimatePresence>
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

      {performOpen && (
        <SetlistPerformer
          setlist={setlist}
          slots={slots}
          onClose={() => setPerformOpen(false)}
        />
      )}
    </div>
  );
}

// Reorder `ids` by lifting every id in `movingSet` (keeping their relative
// order) and re-inserting them as a contiguous block at the drop target.
// Falls back to a plain single-item move when the set has one id.
function reorderWithSelection(ids, movingSet, activeId, overId) {
  const moving = ids.filter((id) => movingSet.has(id));
  const staying = ids.filter((id) => !movingSet.has(id));
  const activeIndex = ids.indexOf(activeId);
  const overIndex = ids.indexOf(overId);
  const goingDown = activeIndex < overIndex;

  let insertIndex;
  if (movingSet.has(overId)) {
    // Dropped onto a row that's part of the group — keep the block where the
    // group already sits relative to the staying rows.
    insertIndex = staying.filter((id) => ids.indexOf(id) < overIndex).length;
  } else if (goingDown) {
    insertIndex = staying.filter((id) => ids.indexOf(id) <= overIndex).length;
  } else {
    insertIndex = staying.filter((id) => ids.indexOf(id) < overIndex).length;
  }

  const result = [...staying];
  result.splice(insertIndex, 0, ...moving);
  return result;
}

// ─── Sortable Slot ─────────────────────────────────────────────────────────

// A segment divider row: draggable, with an inline-editable label, a "new page"
// toggle (forces the segment onto a fresh PDF page) and a remove button.
function SortableDivider({ slot, onUpdateSlot, onRemove }) {
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
  const [label, setLabel] = useState(slot.label || "");
  const pageBreak = !!slot.page_break;

  const commitLabel = () => {
    const next = label.trim();
    if (next !== (slot.label || "")) onUpdateSlot({ label: next });
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`
        relative flex items-center gap-2 p-2 rounded-lg border border-dashed
        bg-[var(--color-bg-warm)]
        ${isDragging ? "shadow-lg opacity-90 border-[var(--color-ink-muted)]" : "border-[var(--color-border)]"}
      `}
    >
      <button
        className='text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] cursor-grab active:cursor-grabbing touch-none shrink-0'
        {...attributes}
        {...listeners}
        title='Drag to reorder'
      >
        <GripVertical size={14} />
      </button>
      <span className='text-[10px] uppercase tracking-wide text-[var(--color-ink-muted)] shrink-0'>
        Segment
      </span>
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onBlur={commitLabel}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        placeholder='Segment name'
        className='flex-1 min-w-0 h-7 px-2 text-xs font-semibold bg-[var(--color-bg)] border border-[var(--color-border)] rounded text-[var(--color-ink)] focus:outline-none focus:border-[var(--color-ink)]'
      />
      <button
        onClick={() => onUpdateSlot({ page_break: !pageBreak })}
        title='Start this segment on a new page in the exported PDF'
        className={`shrink-0 text-[10px] px-2 h-7 rounded border transition-colors ${
          pageBreak
            ? "bg-[var(--color-accent)] text-white border-[var(--color-accent)]"
            : "border-[var(--color-border)] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
        }`}
      >
        New page
      </button>
      <Button
        variant='ghost'
        size='icon-sm'
        onClick={onRemove}
        className='text-red-500 hover:text-red-600 shrink-0'
        title='Remove segment'
      >
        <X size={13} />
      </Button>
    </div>
  );
}

function SortableSlot({
  slot,
  index,
  number,
  seconds = 210,
  selected = false,
  onToggleSelect,
  isGroupDrag = false,
  groupCount = 0,
  onDurationChange,
  onRemove,
  onUpdateSlot,
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: slot.id });

  // Selected rows that aren't the one under the pointer ride along with the
  // group — dim them so it reads as "these are coming too".
  const carriedAlong = isGroupDrag && selected && !isDragging;

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: carriedAlong ? 0.4 : undefined,
  };

  const [localKey, setLocalKey] = useState(
    slot.chosen_key || slot.song?.original_key || "",
  );
  const [localCapo, setLocalCapo] = useState(slot.capo || 0);
  const [confirmRemove, setConfirmRemove] = useState(false);

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
        relative flex items-start gap-3 p-3 border rounded-lg bg-[var(--color-bg)]
        transition-shadow group
        ${selected ? "border-[var(--color-accent)] ring-1 ring-[var(--color-accent)]" : "border-[var(--color-border)]"}
        ${isDragging ? "shadow-lg opacity-90" : selected ? "" : "hover:border-[var(--color-ink-muted)]"}
      `}
    >
      {/* Count badge on the grabbed row when moving a multi-selection group */}
      {isDragging && isGroupDrag && (
        <span className='absolute -top-2 -left-2 z-10 flex items-center justify-center min-w-5 h-5 px-1 rounded-full bg-[var(--color-accent)] text-white text-[10px] font-semibold shadow'>
          {groupCount}
        </span>
      )}

      {/* Select + position + drag handle */}
      <div className='flex flex-col items-center gap-1 shrink-0 pt-0.5'>
        <input
          type='checkbox'
          checked={selected}
          onChange={onToggleSelect}
          onClick={(e) => e.stopPropagation()}
          className='h-3.5 w-3.5 accent-[var(--color-accent)] cursor-pointer'
          title='Select for group move'
        />
        <span className='text-[10px] font-mono text-[var(--color-ink-muted)] w-4 text-center'>
          {number ?? index + 1}
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
          {confirmRemove ? (
            <div className='flex items-center gap-1 shrink-0'>
              <span className='text-[10px] text-red-500'>Remove?</span>
              <Button
                variant='ghost'
                size='icon-sm'
                onClick={onRemove}
                className='text-red-500 hover:text-red-600'
                title='Confirm remove'
              >
                <Check size={12} />
              </Button>
              <Button
                variant='ghost'
                size='icon-sm'
                onClick={() => setConfirmRemove(false)}
                className='text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]'
                title='Cancel'
              >
                <X size={12} />
              </Button>
            </div>
          ) : (
            <Button
              variant='ghost'
              size='icon-sm'
              onClick={() => setConfirmRemove(true)}
              className='text-[var(--color-ink-muted)] hover:text-red-500 shrink-0'
              title='Remove from setlist'
            >
              <X size={13} />
            </Button>
          )}
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

          <div className='flex items-center gap-1.5'>
            <span className='text-[10px] text-[var(--color-ink-muted)] flex items-center gap-0.5'>
              <Clock size={9} /> Length
            </span>
            <div className='flex items-center gap-0.5'>
              <Button
                variant='ghost'
                size='xs'
                onClick={() => onDurationChange?.(Math.max(30, seconds - 30))}
                disabled={seconds <= 30}
                className='w-5 h-5 p-0'
              >
                <ChevronDown size={10} />
              </Button>
              <span className='w-9 text-center font-mono text-[11px] text-[var(--color-ink)] tabular-nums'>
                {formatDuration(seconds)}
              </span>
              <Button
                variant='ghost'
                size='xs'
                onClick={() => onDurationChange?.(Math.min(1800, seconds + 30))}
                disabled={seconds >= 1800}
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
