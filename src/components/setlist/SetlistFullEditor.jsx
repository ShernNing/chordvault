import React, { useState, useEffect, useCallback, useRef } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import {
  X,
  GripVertical,
  FileDown,
  Scissors,
  Clipboard,
  RefreshCw,
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "../ui";
import {
  transposeKey,
  semitonesFromKeyToKey,
  transposeParsedContent,
} from "../../lib/transposition";
import { cleanSongTitle } from "../../lib/ingestion";
import {
  SingleSongForColumn,
  SegmentHeading,
  PRINT_SONG_GAP,
} from "../song/SongRenderer";
import { packPages } from "../../lib/pdfPacking";
import { numberSlots } from "../../lib/setlistSegments";

const MAX_HALF_COL_CHARS = 45;
// A4 at 96dpi is 1122.5px; print wrapper eats 12px top + 24px bottom padding →
// true budget 1086.5px. Must stay in sync with PAGE_HEIGHT in SetlistView's
// handleExportPDF, or preview pagination diverges from the exported PDF.
const PAGE_COL_HEIGHT = 1086;
const SONG_GAP = PRINT_SONG_GAP; // must match the print renderer's band gap
const HALF_COL_WIDTH = 357; // (746 content - 32 gap) / 2
const FULL_WIDTH = 746; // 794 wrapper - 2×24 padding

// NOTE: computePageLayout below is an APPROXIMATE inline preview only. The real
// PDF export uses packPages() (src/lib/pdfPacking.js), which supports mixed
// bands (a wide song stacked below a 2-column region) and segment-divider
// headings that this preview does not render. Segment dividers are filtered out
// before this runs; per-segment numbering and mixed-layout preview parity are a
// tracked follow-up.

// ── helpers ───────────────────────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

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

function parsedContentToSections(parsedContent) {
  const sections = [];
  let cur = { id: uid(), header: null, lines: [] };
  for (const line of parsedContent || []) {
    if (line.type === "section_header") {
      if (cur.header !== null || cur.lines.length > 0) sections.push(cur);
      cur = { id: uid(), header: { ...line }, lines: [] };
    } else {
      cur.lines.push({ ...line });
    }
  }
  if (cur.header !== null || cur.lines.length > 0) sections.push(cur);
  return sections;
}

function sectionsToParsedContent(sections) {
  const lines = [];
  for (const s of sections) {
    if (s.header) lines.push(s.header);
    for (const l of s.lines) lines.push(l);
  }
  return lines;
}

function lineDisplayText(line) {
  if (line.type === "chord_line") {
    if (line.tokens)
      return line.tokens
        .map((t) => " ".repeat(t.leadingSpaces || 0) + t.text)
        .join("");
    return line.raw || "";
  }
  if (line.type === "lyric_line") return line.text || "";
  if (line.type === "section_header") return line.text || "";
  return "";
}

function lineWithNewText(line, text) {
  if (line.type === "chord_line")
    return { ...line, raw: text, tokens: undefined };
  return { ...line, text };
}

function getTransposeData(slot) {
  const displayKey = slot.chosen_key || slot.song?.original_key;
  const semitones =
    slot.chosen_key && slot.song?.original_key
      ? semitonesFromKeyToKey(slot.song.original_key, slot.chosen_key)
      : 0;
  const capo = slot.capo || 0;
  const shapeSemitones = semitones - capo;
  const shapeKey =
    capo > 0 && displayKey ? transposeKey(displayKey, -capo) : displayKey;
  const keyLabel = `${displayKey || ""}${capo > 0 ? ` (capo ${capo})` : ""}`;
  return { shapeSemitones, shapeKey, keyLabel, displayKey };
}

// ── page layout computation (mirrors SetlistView handleExportPDF bin-packing) ─

async function computePageLayout(editedSlots) {
  // numberSlots keeps segment dividers and restarts song numbering after each
  // one, matching the exported PDF exactly.
  const entries = numberSlots(editedSlots);
  if (entries.length === 0) return [];

  // Mirrors the export measurement pass in SetlistView.handleExportPDF: same
  // font context as createPrintContainer, Math.ceil so sub-pixel heights never
  // under-count (scrollHeight rounds to nearest and can round down).
  const measureEl = document.createElement("div");
  measureEl.style.cssText =
    "position:absolute;top:-9999px;left:-9999px;visibility:hidden;pointer-events:none;" +
    "font-family:Arial,sans-serif;font-size:14px;";
  document.body.appendChild(measureEl);
  const measureRoot = createRoot(measureEl);
  const measure = (width, node) => {
    measureEl.style.width = `${width}px`;
    flushSync(() => measureRoot.render(node));
    return Math.ceil(measureEl.getBoundingClientRect().height);
  };

  const items = entries.map((entry, id) => {
    if (entry.kind === "divider") {
      const height = measure(FULL_WIDTH, <SegmentHeading label={entry.label} />);
      return {
        id,
        isDivider: true,
        label: entry.label,
        pageBreak: entry.pageBreak,
        height,
      };
    }
    const slot = entry.slot;
    const parsedContent = sectionsToParsedContent(slot.sections);
    const songNode = (
      <SingleSongForColumn
        song={{ ...slot.song, parsed_content: parsedContent }}
        semitones={0}
        targetKey={slot._displayKey}
        keyLabel={slot._keyLabel}
        songNumber={entry.songNumber}
      />
    );
    if (getMaxLineChars(parsedContent) <= MAX_HALF_COL_CHARS) {
      const h = measure(HALF_COL_WIDTH, songNode);
      if (h <= PAGE_COL_HEIGHT) {
        return {
          id,
          fitsHalf: true,
          height: h,
          slotId: slot.id,
          songNumber: entry.songNumber,
        };
      }
    }
    const h = measure(FULL_WIDTH, songNode);
    return {
      id,
      fitsHalf: false,
      height: h,
      slotId: slot.id,
      songNumber: entry.songNumber,
    };
  });

  measureRoot.unmount();
  document.body.removeChild(measureEl);

  return packPages(items, { pageHeight: PAGE_COL_HEIGHT, gap: SONG_GAP });
}

// ── main component ────────────────────────────────────────────────────────────

export default function SetlistFullEditor({
  setlist,
  slots,
  onClose,
  handleExportPDF,
  handleExportDocx,
  exporting,
  exportingDocx,
}) {
  const [editedSlots, setEditedSlots] = useState(() =>
    slots.map((slot) => {
      // Segment dividers (no song) pass through untouched so they survive the
      // editor's export; they aren't shown in the inline page preview.
      if (!slot.song) return { ...slot, _divider: true };
      const { shapeSemitones, shapeKey, keyLabel, displayKey } =
        getTransposeData(slot);
      const raw = slot.song.parsed_content || [];
      const content =
        shapeSemitones !== 0
          ? transposeParsedContent(raw, shapeSemitones, shapeKey)
          : raw;
      return {
        ...slot,
        _keyLabel: keyLabel,
        _displayKey: displayKey || slot.song?.original_key || "",
        sections: parsedContentToSections(content),
      };
    }),
  );

  const [pages, setPages] = useState(null);
  const [layoutBusy, setLayoutBusy] = useState(true);
  const [clipboard, setClipboard] = useState(null);

  useEffect(() => {
    computePageLayout(editedSlots)
      .then(setPages)
      .finally(() => setLayoutBusy(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: layout computed once on open, not on every editedSlots change
  }, []); // compute once on open

  const refreshLayout = async () => {
    setLayoutBusy(true);
    const p = await computePageLayout(editedSlots);
    setPages(p);
    setLayoutBusy(false);
  };

  // ── section mutations ─────────────────────────────────────────────────────

  const mutateSections = useCallback((slotId, fn) => {
    setEditedSlots((prev) =>
      prev.map((s) =>
        s.id === slotId ? { ...s, sections: fn(s.sections) } : s,
      ),
    );
  }, []);

  const handleReorderSections = useCallback(
    (slotId, activeId, overId) => {
      mutateSections(slotId, (secs) => {
        const a = secs.findIndex((s) => s.id === activeId);
        const b = secs.findIndex((s) => s.id === overId);
        return a < 0 || b < 0 ? secs : arrayMove(secs, a, b);
      });
    },
    [mutateSections],
  );

  const handleEditLine = useCallback(
    (slotId, sectionId, lineIdx, text) => {
      mutateSections(slotId, (secs) =>
        secs.map((sec) => {
          if (sec.id !== sectionId) return sec;
          if (lineIdx === -1) {
            return {
              ...sec,
              header: sec.header
                ? lineWithNewText(sec.header, text)
                : sec.header,
            };
          }
          const nl = [...sec.lines];
          nl[lineIdx] = lineWithNewText(nl[lineIdx], text);
          return { ...sec, lines: nl };
        }),
      );
    },
    [mutateSections],
  );

  const handleCutSection = useCallback(
    (slotId, sectionId) => {
      mutateSections(slotId, (secs) => {
        const section = secs.find((s) => s.id === sectionId);
        if (section) setClipboard({ section });
        return secs.filter((s) => s.id !== sectionId);
      });
    },
    [mutateSections],
  );

  const handlePasteAfter = useCallback(
    (slotId, afterSectionId) => {
      if (!clipboard) return;
      const pasted = { ...clipboard.section, id: uid() };
      mutateSections(slotId, (secs) => {
        const idx = afterSectionId
          ? secs.findIndex((s) => s.id === afterSectionId)
          : -1;
        const out = [...secs];
        out.splice(idx + 1, 0, pasted);
        return out;
      });
      setClipboard(null);
    },
    [clipboard, mutateSections],
  );

  // ── export ────────────────────────────────────────────────────────────────

  const buildExportSlots = useCallback(
    () =>
      editedSlots.map((slot) =>
        slot._divider
          ? slot // segment dividers pass straight through to the exporter
          : {
              ...slot,
              chosen_key: null,
              capo: 0,
              song: {
                ...slot.song,
                original_key: slot._displayKey,
                parsed_content: sectionsToParsedContent(slot.sections),
              },
            },
      ),
    [editedSlots],
  );

  const onExportPDF = () => handleExportPDF(buildExportSlots());
  const onExportDocx = () => handleExportDocx(buildExportSlots());

  // slotById map, rebuilt on every editedSlots change so pages always see latest content
  const slotById = Object.fromEntries(editedSlots.map((s) => [s.id, s]));

  return (
    <div
      className='fixed inset-0 z-50 flex flex-col'
      style={{ backgroundColor: "#c8c8c8" }}
    >
      {/* Top bar */}
      <div className='flex items-center justify-between gap-4 px-5 py-3 border-b border-[var(--color-border)] shrink-0 bg-[var(--color-bg-warm)]'>
        <div className='flex items-center gap-3 min-w-0'>
          <Button
            variant='ghost'
            size='icon-sm'
            onClick={onClose}
            title='Close editor'
          >
            <X size={15} />
          </Button>
          <h2 className='font-display text-lg text-[var(--color-ink)] truncate'>
            {setlist.name}
          </h2>
          {clipboard && (
            <span className='flex items-center gap-1 text-xs text-amber-600'>
              <Clipboard size={11} />
              &ldquo;{clipboard.section?.header?.text || "Section"}&rdquo; cut,
              click Paste to place
            </span>
          )}
        </div>
        <div className='flex items-center gap-2 shrink-0'>
          <Button
            variant='ghost'
            size='sm'
            onClick={refreshLayout}
            disabled={layoutBusy}
            title='Re-measure and repack pages after edits'
          >
            <RefreshCw size={13} className={layoutBusy ? "animate-spin" : ""} />
            Refresh layout
          </Button>
          <Button
            variant='secondary'
            size='sm'
            onClick={onExportPDF}
            loading={exporting}
          >
            <FileDown size={13} /> Export PDF
          </Button>
          <Button
            variant='secondary'
            size='sm'
            onClick={onExportDocx}
            loading={exportingDocx}
          >
            <FileDown size={13} /> Export Word
          </Button>
        </div>
      </div>

      {/* Page canvas */}
      <div className='flex-1 overflow-y-auto py-8'>
        {layoutBusy ? (
          <div className='flex flex-col items-center justify-center h-full gap-3'>
            <RefreshCw
              size={22}
              className='animate-spin text-[var(--color-ink-muted)]'
            />
            <span className='text-sm text-[var(--color-ink-muted)]'>
              Computing page layout…
            </span>
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "32px",
            }}
          >
            {(pages || []).map((page, pi) => (
              <EditorPage
                key={pi}
                pageNum={pi + 1}
                page={page}
                slotById={slotById}
                clipboard={clipboard}
                onReorderSections={handleReorderSections}
                onEditLine={handleEditLine}
                onCutSection={handleCutSection}
                onPasteAfter={handlePasteAfter}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── editor page ───────────────────────────────────────────────────────────────

function EditorPage({
  pageNum,
  page,
  slotById,
  clipboard,
  onReorderSections,
  onEditLine,
  onCutSection,
  onPasteAfter,
}) {
  const pageStyle = {
    width: "794px",
    minHeight: "1123px",
    padding: "12px 24px 24px",
    backgroundColor: "#ffffff",
    boxShadow: "0 2px 12px rgba(0,0,0,0.18)",
    fontFamily: "Arial, sans-serif",
    fontSize: "16px",
    color: "#000000",
    position: "relative",
    boxSizing: "border-box",
  };

  const renderSong = (d) => {
    const slot = slotById[d.slotId];
    if (!slot) return null;
    return (
      <EditableSongContent
        key={slot.id}
        slot={slot}
        songNumber={d.songNumber}
        clipboard={clipboard}
        onReorderSections={(aId, oId) => onReorderSections(slot.id, aId, oId)}
        onEditLine={(secId, li, text) => onEditLine(slot.id, secId, li, text)}
        onCutSection={(secId) => onCutSection(slot.id, secId)}
        onPasteAfter={(afterId) => onPasteAfter(slot.id, afterId)}
      />
    );
  };

  const colStyle = {
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: `${SONG_GAP}px`,
  };

  return (
    <div style={pageStyle}>
      <PageLabel num={pageNum} />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: `${SONG_GAP}px`,
        }}
      >
        {(page.bands || []).map((band, bi) => {
          if (band.type === "heading")
            return <SegmentHeading key={bi} label={band.label} />;
          if (band.type === "full") return <div key={bi}>{renderSong(band.item)}</div>;
          const hasTwoColumns = band.right.length > 0;
          return (
            <div key={bi} style={hasTwoColumns ? { display: "flex", gap: "32px" } : {}}>
              <div style={hasTwoColumns ? { flex: 1, ...colStyle } : colStyle}>
                {band.left.map(renderSong)}
              </div>
              {hasTwoColumns && (
                <div style={{ flex: 1, ...colStyle }}>{band.right.map(renderSong)}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PageLabel({ num }) {
  return (
    <div
      style={{
        position: "absolute",
        top: "4px",
        right: "8px",
        fontSize: "10px",
        color: "#ccc",
        userSelect: "none",
        pointerEvents: "none",
      }}
    >
      p.{num}
    </div>
  );
}

// ── editable song content ─────────────────────────────────────────────────────

function EditableSongContent({
  slot,
  songNumber,
  clipboard,
  onReorderSections,
  onEditLine,
  onCutSection,
  onPasteAfter,
}) {
  const sectionIds = slot.sections.map((s) => s.id);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const handleDragEnd = ({ active, over }) => {
    if (over && active.id !== over.id) onReorderSections(active.id, over.id);
  };

  return (
    <div>
      {/* Song header, matches PrintSongHeader exactly */}
      <div style={{ marginBottom: "8px" }}>
        <span
          style={{
            fontSize: "19px",
            fontWeight: "700",
            display: "block",
            wordBreak: "break-word",
          }}
        >
          {songNumber != null ? `${songNumber}. ` : ""}
          {cleanSongTitle(slot.song?.title || "")}
          {slot.song?.artist ? ` - ${slot.song.artist}` : ""}
          {slot._keyLabel ? ` (${slot._keyLabel})` : ""}
        </span>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={sectionIds}
          strategy={verticalListSortingStrategy}
        >
          {clipboard && (
            <PasteZone
              label='Paste at top'
              onPaste={() => onPasteAfter(null)}
            />
          )}
          {slot.sections.map((section) => (
            <React.Fragment key={section.id}>
              <EditableSection
                section={section}
                onEditLine={(li, text) => onEditLine(section.id, li, text)}
                onCut={() => onCutSection(section.id)}
              />
              {clipboard && (
                <PasteZone
                  label='Paste here'
                  onPaste={() => onPasteAfter(section.id)}
                />
              )}
            </React.Fragment>
          ))}
        </SortableContext>
      </DndContext>
    </div>
  );
}

// ── paste zone ────────────────────────────────────────────────────────────────

function PasteZone({ label, onPaste }) {
  return (
    <button
      onClick={onPaste}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "4px",
        width: "100%",
        padding: "4px 0",
        margin: "2px 0",
        fontSize: "11px",
        color: "#d97706",
        border: "1px dashed #fbbf24",
        borderRadius: "3px",
        background: "transparent",
        cursor: "pointer",
      }}
      onMouseOver={(e) => (e.currentTarget.style.background = "#fffbeb")}
      onMouseOut={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <Clipboard size={11} /> {label}
    </button>
  );
}

// ── editable section ──────────────────────────────────────────────────────────

function EditableSection({ section, onEditLine, onCut }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: section.id });
  const [hovered, setHovered] = useState(false);

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 40 : undefined,
        position: "relative",
        marginTop: section.header ? "12px" : 0,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {(hovered || isDragging) && (
        <div
          style={{
            position: "absolute",
            right: 0,
            top: 0,
            zIndex: 10,
            display: "flex",
            alignItems: "center",
            gap: "2px",
            background: "#fff",
            border: "1px solid #ddd",
            borderRadius: "4px",
            padding: "2px 4px",
            boxShadow: "0 1px 4px rgba(0,0,0,0.14)",
          }}
        >
          <button
            title='Drag to reorder section'
            style={{
              color: "#aaa",
              cursor: "grab",
              lineHeight: 0,
              padding: "2px",
            }}
            {...attributes}
            {...listeners}
          >
            <GripVertical size={13} />
          </button>
          <button
            title='Cut section'
            style={{
              color: "#aaa",
              cursor: "pointer",
              lineHeight: 0,
              padding: "2px",
            }}
            onClick={onCut}
            onMouseOver={(e) => (e.currentTarget.style.color = "#ef4444")}
            onMouseOut={(e) => (e.currentTarget.style.color = "#aaa")}
          >
            <Scissors size={13} />
          </button>
        </div>
      )}
      {section.header && (
        <EditableLineItem
          line={section.header}
          lineIdx={-1}
          onCommit={(t) => onEditLine(-1, t)}
        />
      )}
      {section.lines.map((line, li) =>
        line.type === "blank" ? (
          <div key={li} style={{ height: "8px" }} />
        ) : (
          <EditableLineItem
            key={li}
            line={line}
            lineIdx={li}
            onCommit={(t) => onEditLine(li, t)}
          />
        ),
      )}
    </div>
  );
}

// ── editable line item ────────────────────────────────────────────────────────

const CHORD_STYLE = {
  fontFamily: "monospace",
  fontSize: "14px",
  color: "#1d4ed8",
  display: "block",
  lineHeight: "1.3",
  whiteSpace: "pre",
  cursor: "text",
  borderRadius: "2px",
  padding: "0 2px",
};

const LYRIC_STYLE = {
  fontFamily: "Arial, sans-serif",
  fontSize: "16px",
  color: "#000000",
  display: "block",
  lineHeight: "1.35",
  marginBottom: "2px",
  cursor: "text",
  borderRadius: "2px",
  padding: "0 2px",
};

const SECTION_HEADER_STYLE = {
  fontFamily: "Arial, sans-serif",
  fontSize: "16px",
  fontWeight: "700",
  color: "#000000",
  display: "block",
  lineHeight: "1.2",
  marginTop: "8px",
  marginBottom: "2px",
  cursor: "text",
  borderRadius: "2px",
  padding: "0 2px",
};

const INPUT_EXTRA = {
  border: "1px solid #60a5fa",
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
  background: "#eff6ff",
};

function EditableLineItem({ line, onCommit }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef(null);

  const displayText = lineDisplayText(line);

  const startEdit = () => {
    setDraft(displayText);
    setEditing(true);
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
  };

  const commit = () => {
    onCommit(draft);
    setEditing(false);
  };
  const cancel = () => setEditing(false);
  const onKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    }
    if (e.key === "Escape") cancel();
  };

  const baseStyle =
    line.type === "section_header"
      ? SECTION_HEADER_STYLE
      : line.type === "chord_line"
        ? CHORD_STYLE
        : LYRIC_STYLE;

  const hoverBg =
    line.type === "chord_line"
      ? "#eff6ff"
      : line.type === "section_header"
        ? "#f3f4f6"
        : "#f9fafb";

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={onKeyDown}
        style={{ ...baseStyle, ...INPUT_EXTRA }}
        autoFocus
      />
    );
  }

  return (
    <span
      style={{ ...baseStyle, background: "transparent" }}
      title='Click to edit'
      onClick={startEdit}
      onMouseOver={(e) => (e.currentTarget.style.background = hoverBg)}
      onMouseOut={(e) => (e.currentTarget.style.background = "transparent")}
    >
      {displayText ||
        (line.type === "section_header" ? (
          <span style={{ color: "#bbb", fontStyle: "italic" }}>
            Section header
          </span>
        ) : (
          " "
        ))}
    </span>
  );
}
