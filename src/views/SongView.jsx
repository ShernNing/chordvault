import React, { useState, useRef, useMemo } from "react";
import { createRoot } from "react-dom/client";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  ArrowLeft,
  Edit3,
  Save,
  X,
  Columns2,
  FileDown,
  Trash2,
  AlertTriangle,
  Check,
  RefreshCw,
  Copy,
  Search,
  Type,
  KeyRound,
  ListMusic,
  Guitar,
  Zap,
  PlayCircle,
  Share2,
  Link2,
  Mic,
  Music4,
} from "lucide-react";
import {
  useSong,
  useLocalStorage,
  useDisplaySettings,
  useSetlists,
  FONT_OPTIONS,
} from "../lib/hooks";
import { supabaseSongOps, supabaseSetlistOps } from "../lib/supabaseOps";
import {
  transposeKey,
  getCapoShapeKey,
  transposeParsedContent,
  transposeChord,
} from "../lib/transposition";
import {
  extractChords,
  detectKey,
  ingest,
  tokenizeChordLine,
} from "../lib/ingestion";
import { cycleNashville } from "../lib/nashville";
import { bestTransposeFrets } from "../lib/voicings/transpose";
import { PRESETS } from "../lib/voicings/flow";
import { exportSongToPDF, createPrintContainer } from "../lib/pdf";
import { exportSongToDocx } from "../lib/docxExport";
import { useToast } from "../lib/toast";
import { useAuth } from "../lib/AuthContext";
import { lookupArtist } from "../lib/musicbrainz";
import {
  Button,
  Input,
  Textarea,
  TagInput,
  Badge,
  Modal,
  ErrorState,
  SongViewSkeleton,
  Tooltip,
  Select,
} from "../components/ui";
import { createSongShare, shareUrl } from "../lib/shares";
import SongRenderer, {
  PrintableSongSheet,
} from "../components/song/SongRenderer";
import TransposeControls from "../components/song/TransposeControls";
import PerformBar from "../components/song/PerformBar";
import ChordPlayer from "../components/song/ChordPlayer";
import VocalRangeHelper from "../components/song/VocalRangeHelper";
import VoicingDrawer from "../components/voicings/VoicingDrawer";
import SongVoicingsPanel from "../components/voicings/SongVoicingsPanel";
import ElectricGuitarNotesPanel from "../components/song/ElectricGuitarNotesPanel";

export default function SongView() {
  const { id } = useParams();
  const navigate = useNavigate();

  const { song, loading, error, reload, update } = useSong(id);
  const { fontSize, setFontSize, fontFamily, setFontFamily } =
    useDisplaySettings();
  const { setlists } = useSetlists();
  const toast = useToast();
  const { canEditSong, canDeleteSong } = useAuth();

  // Edit / "Save key" / Delete: superuser does any; a leader does only songs they
  // created. Members can do neither. Mirrors the songs RLS policies (see ROLES.md)
  //, the UI just hides what the database would reject anyway.
  const canEdit = canEditSong(song);
  const canDelete = canDeleteSong(song);

  // Per-song transpose state stored in localStorage
  const [transpose, setTranspose] = useLocalStorage(`cv-transpose-${id}`, {
    semitones: 0,
    capo: 0,
  });
  const [twoColumn, setTwoColumn] = useLocalStorage(`cv-2col-${id}`, "auto");
  const [nashville, setNashville] = useLocalStorage("cv-nashville", false);
  const [voicingsInline, setVoicingsInline] = useLocalStorage(
    "cv-voicings-inline",
    false,
  );
  const [voicingPreset, setVoicingPreset] = useLocalStorage(
    "cv-voicing-preset",
    0,
  );
  const [bpm, setBpm] = useLocalStorage(`cv-bpm-${id}`, 100);
  const [showPerform, setShowPerform] = useState(false);
  const [showChordPlayer, setShowChordPlayer] = useState(false);
  const [showRangePanel, setShowRangePanel] = useState(false);
  const [shared, setShared] = useState(false);
  const [shareLink, setShareLink] = useState("");
  const [sharingLink, setSharingLink] = useState(false);

  // Sounding chords in playing order (post-transpose) for the chord player.
  const songChords = useMemo(() => {
    if (!song?.parsed_content) return [];
    const dk = song.original_key
      ? transposeKey(song.original_key, transpose.semitones)
      : null;
    const content =
      transpose.semitones !== 0
        ? transposeParsedContent(song.parsed_content, transpose.semitones, dk)
        : song.parsed_content;
    return extractChords(content);
  }, [song?.parsed_content, song?.original_key, transpose.semitones]);

  const [isEditing, setIsEditing] = useState(false);
  const [deleteModal, setDeleteModal] = useState(false);
  const [addToSetlistOpen, setAddToSetlistOpen] = useState(false);
  const [chosenSetlistId, setChosenSetlistId] = useState("");
  const [addingToSetlist, setAddingToSetlist] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportingDocx, setExportingDocx] = useState(false);
  const [copied, setCopied] = useState(false);
  const [savingKey, setSavingKey] = useState(false);
  const [confirmSaveKey, setConfirmSaveKey] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showFontPanel, setShowFontPanel] = useState(false);
  const [activeVoicingChord, setActiveVoicingChord] = useState(null);
  const [showVoicingsPanel, setShowVoicingsPanel] = useState(false);
  const [showElectricPanel, setShowElectricPanel] = useState(false);

  const printRef = useRef(null);

  if (!id) return <ErrorState message='Invalid song ID' />;
  if (loading) return <SongViewSkeleton />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!song) return <ErrorState message='Song not found' />;

  const displayKey = song.original_key
    ? transposeKey(song.original_key, transpose.semitones)
    : null;

  // Chords to display = shape key (shifted down by capo frets)
  const shapeKey = getCapoShapeKey(displayKey, transpose.capo);
  const shapeSemitones = transpose.semitones - transpose.capo;

  const handleTransposeChange = (semitones, capo) => {
    setTranspose({ semitones, capo });
  };

  const handleSaveKey = async () => {
    if (!displayKey || !transpose.semitones) return;
    setSavingKey(true);
    try {
      // Transpose parsed_content to new key so stored chords match new original_key
      const transposed = transposeParsedContent(
        song.parsed_content,
        transpose.semitones,
        displayKey,
      );
      // Rebuild raw_content from transposed tokens so re-ingestion stays consistent
      const rebuiltRaw = transposed
        .map((line) => {
          if (line.type === "chord_line")
            return line.tokens
              .map((t) => " ".repeat(t.leadingSpaces || 0) + t.text)
              .join("");
          if (line.type === "blank") return "";
          return line.text ?? "";
        })
        .join("\n");
      const updates = { original_key: displayKey, raw_content: rebuiltRaw };
      if (song.electric_guitar_notes?.length) {
        updates.electric_guitar_notes = song.electric_guitar_notes.map((e) => {
          if (e.type === "lick") {
            const shift = (f) => {
              let r = f + transpose.semitones;
              while (r < 0) r += 12;
              while (r > 24) r -= 12;
              return r;
            };
            return {
              ...e,
              notes: (e.notes || []).map((n) => {
                const out = { string: n.string, fret: shift(n.fret) };
                if (n.slideTo != null) out.slideTo = shift(n.slideTo);
                if (n.bend != null) out.bend = n.bend;
                return out;
              }),
            };
          }
          return {
            ...e,
            chord: transposeChord(e.chord, transpose.semitones, displayKey),
            frets: bestTransposeFrets(e.frets, transpose.semitones) || e.frets,
          };
        });
      }
      await update(updates);
      setTranspose({ semitones: 0, capo: transpose.capo });
      setConfirmSaveKey(false);
      toast.success(`Saved ${displayKey} as the song's key`);
    } catch (e) {
      toast.error(e.message || "Could not save key");
    } finally {
      setSavingKey(false);
    }
  };

  const handleLineTypeOverride = async (index, newType) => {
    const line = song.parsed_content[index];
    if (!line) return;
    let updatedLine;
    if (line.type === "chord_line" && newType === "lyric_line") {
      const text = line.tokens
        ? line.tokens
            .map((t) => " ".repeat(t.leadingSpaces || 0) + t.text)
            .join("")
        : line.raw || "";
      updatedLine = { type: "lyric_line", text, uncertain: false };
    } else if (line.type === "lyric_line" && newType === "chord_line") {
      const tokens = tokenizeChordLine(line.text || "");
      updatedLine = {
        type: "chord_line",
        tokens,
        raw: line.text || "",
        uncertain: false,
      };
    } else {
      updatedLine = { ...line, type: newType, uncertain: false };
    }
    const newContent = song.parsed_content.map((l, i) =>
      i === index ? updatedLine : l,
    );
    await update({ parsed_content: newContent });
  };

  const handleAcceptAllWarnings = async () => {
    const newContent = song.parsed_content.map((l) =>
      l.uncertain ? { ...l, uncertain: false } : l,
    );
    await update({ parsed_content: newContent });
  };

  const handleSaveVoicings = async (nextStore) => {
    try {
      await update({ inline_voicings: nextStore });
      toast.success("Voicings saved");
    } catch (e) {
      const msg = String(e?.message || e);
      toast.error(
        `Save failed: ${msg}` +
          (msg.includes("inline_voicings")
            ? `\n\nAdd the column in Supabase:\n\nALTER TABLE songs ADD COLUMN inline_voicings jsonb DEFAULT '{}'::jsonb;`
            : ""),
      );
      throw e;
    }
  };

  const hasUncertain = song.parsed_content?.some((l) => l.uncertain);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(song.raw_content || "");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    setSharingLink(true);
    try {
      const token = await createSongShare(song);
      const url = shareUrl(token);
      setShareLink(url);
      if (navigator.share) {
        try {
          await navigator.share({ title: song.title, url });
        } catch {
          /* cancelled */
        }
      } else {
        try {
          await navigator.clipboard.writeText(url);
        } catch {
          /* clipboard blocked */
        }
        setShared(true);
        setTimeout(() => setShared(false), 2000);
      }
    } catch (e) {
      toast.error(e.message || "Could not create share link");
    } finally {
      setSharingLink(false);
    }
  };

  const handleExportDocx = async () => {
    setExportingDocx(true);
    try {
      const keyLabel = displayKey
        ? `${displayKey}${transpose.capo > 0 ? ` (capo ${transpose.capo})` : ""}`
        : null;
      await exportSongToDocx(song, shapeSemitones, shapeKey, keyLabel);
    } catch (e) {
      console.error("Docx export failed:", e);
      toast.error("DOCX export failed");
    } finally {
      setExportingDocx(false);
    }
  };

  const handleExportPDF = async () => {
    setExporting(true);
    try {
      const container = createPrintContainer();
      // Render a PrintableSongSheet into the container
      const root = createRoot(container);
      root.render(
        <PrintableSongSheet
          song={song}
          semitones={shapeSemitones}
          targetKey={shapeKey}
          keyLabel={
            displayKey
              ? `${displayKey}${transpose.capo > 0 ? ` (capo ${transpose.capo})` : ""}`
              : null
          }
        />,
      );
      // Wait for render
      await new Promise((r) => setTimeout(r, 300));
      await exportSongToPDF(
        song.title,
        displayKey || song.original_key,
        container,
      );
      root.unmount();
      document.body.removeChild(container);
    } catch (e) {
      console.error("PDF export failed:", e);
      toast.error("PDF export failed");
    } finally {
      setExporting(false);
    }
  };

  const handleAddToSetlist = async () => {
    if (!chosenSetlistId) return;
    setAddingToSetlist(true);
    try {
      await supabaseSetlistOps.addSong(
        chosenSetlistId,
        song.id,
        song.original_key || null,
        transpose.capo,
      );
      const dest =
        setlists.find((s) => s.id === chosenSetlistId)?.name || "setlist";
      setAddToSetlistOpen(false);
      setChosenSetlistId("");
      toast.success(`Added to ${dest}`);
    } catch (e) {
      toast.error(e.message || "Could not add to setlist");
    } finally {
      setAddingToSetlist(false);
    }
  };

  return (
    <div className='max-w-4xl mx-auto space-y-4'>
      {/* ── Breadcrumb ────────────────────────────────────────────── */}
      <div className='flex items-center gap-2'>
        <Link
          to='/'
          className='flex items-center gap-1 text-xs text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] transition-colors'
        >
          <ArrowLeft size={12} /> Library
        </Link>
        <span className='text-xs text-[var(--color-ink-muted)]'>/</span>
        <span className='text-xs text-[var(--color-ink-soft)] truncate'>
          {song.title}
        </span>
      </div>

      {/* ── Song Header ───────────────────────────────────────────── */}
      <div className='flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4'>
        <div className='min-w-0'>
          {/* Title styled like the printed chord sheet: bold title + key in parens */}
          <div className='flex items-baseline gap-2 flex-wrap'>
            <h1 className='font-mono text-base font-bold text-[var(--color-ink)] leading-tight'>
              {song.title}
              {song.original_key && (
                <span className='font-mono text-base font-bold text-[var(--color-ink)] ml-1'>
                  ({displayKey || song.original_key})
                </span>
              )}
            </h1>
          </div>
          {song.artist && (
            <p className='text-xs text-[var(--color-ink-soft)] mt-0.5 font-sans'>
              {song.artist}
            </p>
          )}
          {song.tags?.length > 0 && (
            <div className='flex items-center gap-1.5 mt-1.5 flex-wrap'>
              {song.tags.map((tag) => (
                <Badge key={tag} variant='default'>
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className='flex flex-wrap items-center gap-1 sm:shrink-0 no-print'>
          <Tooltip content={copied ? "Copied!" : "Copy chord sheet"}>
            <Button
              variant='ghost'
              size='icon-sm'
              onClick={handleCopy}
              title='Copy chord sheet'
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </Button>
          </Tooltip>
          <Tooltip
            content={shared ? "Link copied!" : "Create public share link"}
          >
            <Button
              variant='ghost'
              size='icon-sm'
              onClick={handleShare}
              loading={sharingLink}
              title='Share link'
            >
              {shared || shareLink ? <Link2 size={14} /> : <Share2 size={14} />}
            </Button>
          </Tooltip>
          <Tooltip content='Export PDF'>
            <Button
              variant='ghost'
              size='icon-sm'
              onClick={handleExportPDF}
              loading={exporting}
              title='Export PDF'
            >
              <FileDown size={14} />
            </Button>
          </Tooltip>
          <Tooltip content='Export Word'>
            <Button
              variant='ghost'
              size='icon-sm'
              onClick={handleExportDocx}
              loading={exportingDocx}
              title='Export Word'
            >
              <FileDown size={14} />
            </Button>
          </Tooltip>
          <Tooltip
            content={
              twoColumn === true
                ? "2-col on"
                : twoColumn === false
                  ? "1-col"
                  : "2-col auto"
            }
          >
            <Button
              variant='ghost'
              size='icon-sm'
              onClick={() =>
                setTwoColumn((c) =>
                  c === "auto" ? true : c === true ? false : "auto",
                )
              }
              className={
                twoColumn !== false ? "text-[var(--color-accent)]" : ""
              }
              title='Toggle 2-column layout'
            >
              <Columns2 size={14} />
            </Button>
          </Tooltip>
          <Tooltip content='Font & size'>
            <Button
              variant='ghost'
              size='icon-sm'
              onClick={() => setShowFontPanel((p) => !p)}
              className={showFontPanel ? "text-[var(--color-accent)]" : ""}
              title='Font & size'
            >
              <Type size={14} />
            </Button>
          </Tooltip>
          <Tooltip content='Perform mode (auto-scroll + metronome)'>
            <Button
              variant='ghost'
              size='icon-sm'
              onClick={() => setShowPerform((p) => !p)}
              className={showPerform ? "text-[var(--color-accent)]" : ""}
              title='Perform mode'
            >
              <PlayCircle size={14} />
            </Button>
          </Tooltip>
          <Tooltip content='Play the chords (strum-along)'>
            <Button
              variant='ghost'
              size='icon-sm'
              onClick={() => setShowChordPlayer((p) => !p)}
              className={showChordPlayer ? "text-[var(--color-accent)]" : ""}
              title='Play chords'
            >
              <Music4 size={14} />
            </Button>
          </Tooltip>
          <Tooltip content='Fit the key to my vocal range'>
            <Button
              variant='ghost'
              size='icon-sm'
              onClick={() => setShowRangePanel((p) => !p)}
              className={showRangePanel ? "text-[var(--color-accent)]" : ""}
              title='Fit to my voice'
            >
              <Mic size={14} />
            </Button>
          </Tooltip>
          <Tooltip content='Add to setlist'>
            <Button
              variant='ghost'
              size='icon-sm'
              onClick={() => setAddToSetlistOpen(true)}
              title='Add to setlist'
            >
              <ListMusic size={14} />
            </Button>
          </Tooltip>
          <Tooltip content='Show chord voicings for this song'>
            <Button
              variant='ghost'
              size='icon-sm'
              onClick={() => setShowVoicingsPanel(true)}
              title='Chord voicings'
            >
              <Guitar size={14} />
            </Button>
          </Tooltip>
          <Tooltip content='Electric guitar voicing notes'>
            <Button
              variant='ghost'
              size='icon-sm'
              onClick={() => setShowElectricPanel(true)}
              title='Electric guitar voicings'
            >
              <Zap size={14} />
            </Button>
          </Tooltip>
          {canEdit && (
            <Tooltip content='Edit song'>
              <Button
                variant='ghost'
                size='icon-sm'
                onClick={() => setIsEditing(true)}
                title='Edit song'
              >
                <Edit3 size={14} />
              </Button>
            </Tooltip>
          )}
          {canDelete && (
            <Tooltip content='Delete song'>
              <Button
                variant='ghost'
                size='icon-sm'
                onClick={() => setDeleteModal(true)}
                className='text-red-400 hover:text-red-600'
                title='Delete song'
              >
                <Trash2 size={14} />
              </Button>
            </Tooltip>
          )}
          <Tooltip content='Re-detect key from chords'>
            <Button
              variant='ghost'
              size='icon-sm'
              title='Re-detect key'
              onClick={async () => {
                const chords = extractChords(song.parsed_content);
                const result = detectKey(chords);
                if (result?.key) await update({ original_key: result.key });
              }}
            >
              <RefreshCw size={14} />
            </Button>
          </Tooltip>
        </div>
      </div>

      {/* ── Transpose Controls ────────────────────────────────────── */}
      <div className='no-print'>
        <TransposeControls
          originalKey={song.original_key}
          semitones={transpose.semitones}
          capo={transpose.capo}
          onChange={handleTransposeChange}
          nashville={nashville}
          onToggleNashville={() => setNashville(cycleNashville)}
          voicings={voicingsInline}
          onToggleVoicings={() => setVoicingsInline((v) => !v)}
          voicingPreset={voicingPreset}
          onCyclePreset={(dir) =>
            setVoicingPreset((i) => (i + dir + PRESETS.length) % PRESETS.length)
          }
        />
      </div>

      {/* ── Share link banner ─────────────────────────────────────── */}
      {shareLink && (
        <div className='no-print flex items-center gap-2 px-3 py-2 bg-[var(--color-accent-soft)] border border-[var(--color-border)] rounded-lg text-xs'>
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

      {/* ── Vocal Range Panel ─────────────────────────────────────── */}
      {showRangePanel && (
        <div className='no-print'>
          <VocalRangeHelper
            songId={id}
            originalKey={song.original_key}
            currentCapo={transpose.capo}
            onApply={(semitones, capo) => {
              setTranspose({ semitones, capo });
              setShowRangePanel(false);
            }}
          />
        </div>
      )}

      {/* ── Save Key Banner ───────────────────────────────────────── */}
      {/* Save key rewrites the song → same as editing (superuser, or leader on
          their own song). Everyone can still transpose freely for viewing;
          only persisting it is gated. */}
      {canEdit && transpose.semitones !== 0 && song.original_key && (
        <div className='no-print flex items-center justify-between gap-3 px-3 py-2 bg-[var(--color-accent-soft)] border border-[var(--color-border)] rounded-lg'>
          <span className='text-xs text-[var(--color-ink-soft)]'>
            Save <strong className='font-mono'>{displayKey}</strong> as this
            song's key?
          </span>
          <Button
            variant='secondary'
            size='sm'
            loading={savingKey}
            onClick={() => setConfirmSaveKey(true)}
          >
            <KeyRound size={12} /> Save key
          </Button>
        </div>
      )}

      {/* ── Font & Size Panel ─────────────────────────────────────── */}
      {showFontPanel && (
        <div className='no-print flex flex-wrap items-center gap-4 px-3 py-2.5 bg-[var(--color-bg-warm)] border border-[var(--color-border)] rounded-lg'>
          <div className='flex items-center gap-2'>
            <span className='text-xs text-[var(--color-ink-muted)] uppercase tracking-wide'>
              Font
            </span>
            <Select
              className='w-44 h-7 text-xs'
              value={fontFamily}
              onChange={(e) => setFontFamily(e.target.value)}
            >
              {FONT_OPTIONS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </Select>
          </div>
          <div className='flex items-center gap-2'>
            <span className='text-xs text-[var(--color-ink-muted)] uppercase tracking-wide'>
              Size
            </span>
            <div className='flex items-center gap-1'>
              <Button
                variant='secondary'
                size='icon-sm'
                onClick={() => setFontSize((s) => Math.max(10, s - 1))}
                disabled={fontSize <= 10}
              >
                <span className='text-xs leading-none'>−</span>
              </Button>
              <span className='w-10 text-center font-mono text-xs'>
                {fontSize}px
              </span>
              <Button
                variant='secondary'
                size='icon-sm'
                onClick={() => setFontSize((s) => Math.min(20, s + 1))}
                disabled={fontSize >= 20}
              >
                <span className='text-xs leading-none'>+</span>
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Uncertain Lines Banner ───────────────────────────────── */}
      {hasUncertain && (
        <div className='no-print flex items-center justify-between gap-3 px-3 py-2 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg'>
          <span className='text-xs text-amber-700 dark:text-amber-300 flex items-center gap-1.5'>
            <AlertTriangle size={12} />
            Some lines have uncertain classification, hover to fix each, or
            accept all.
          </span>
          <Button
            variant='secondary'
            size='sm'
            onClick={handleAcceptAllWarnings}
          >
            Accept all
          </Button>
        </div>
      )}

      {/* ── Chord Sheet ───────────────────────────────────────────── */}
      <ChordSheetPage
        song={song}
        semitones={shapeSemitones}
        targetKey={shapeKey}
        twoColumn={twoColumn}
        onTwoColumnChange={setTwoColumn}
        printRef={printRef}
        fontSize={fontSize}
        onReload={reload}
        onLineTypeOverride={handleLineTypeOverride}
        onChordClick={setActiveVoicingChord}
        nashville={nashville}
        voicings={voicingsInline}
        voicingPreset={voicingPreset}
        voicingStore={song.inline_voicings || null}
        onSaveVoicings={canEdit ? handleSaveVoicings : null}
      />

      {showPerform && (
        <PerformBar
          bpm={bpm}
          onBpmChange={setBpm}
          onClose={() => setShowPerform(false)}
        />
      )}

      {showChordPlayer && (
        <ChordPlayer
          chords={songChords}
          bpm={bpm}
          raised={showPerform}
          onClose={() => setShowChordPlayer(false)}
        />
      )}

      <VoicingDrawer
        chord={activeVoicingChord}
        onClose={() => setActiveVoicingChord(null)}
      />
      {showVoicingsPanel && (
        <SongVoicingsPanel
          song={song}
          semitones={shapeSemitones}
          targetKey={shapeKey}
          onClose={() => setShowVoicingsPanel(false)}
        />
      )}
      {showElectricPanel && (
        <ElectricGuitarNotesPanel
          song={song}
          semitones={transpose.semitones}
          displayKey={displayKey}
          onSave={async (entries) => {
            try {
              await update({ electric_guitar_notes: entries });
            } catch (e) {
              console.error("Failed to save electric guitar notes:", e);
              alert(
                `Save failed: ${e.message || e}\n\nIf this mentions "electric_guitar_notes" column, run this SQL in Supabase:\n\nALTER TABLE songs ADD COLUMN electric_guitar_notes jsonb DEFAULT '[]'::jsonb;`,
              );
              throw e;
            }
          }}
          onClose={() => setShowElectricPanel(false)}
        />
      )}

      {/* ── Add to Setlist Modal ──────────────────────────────────── */}
      <Modal
        isOpen={addToSetlistOpen}
        onClose={() => {
          setAddToSetlistOpen(false);
          setChosenSetlistId("");
        }}
        title='Add to setlist'
      >
        {setlists.length === 0 ? (
          <>
            <p className='text-sm text-[var(--color-ink-soft)] mb-4'>
              No setlists yet. Create one first.
            </p>
            <div className='flex gap-2 justify-end'>
              <Button
                variant='secondary'
                size='sm'
                onClick={() => {
                  setAddToSetlistOpen(false);
                  setChosenSetlistId("");
                }}
              >
                Cancel
              </Button>
              <Button
                variant='primary'
                size='sm'
                onClick={() => {
                  setAddToSetlistOpen(false);
                  navigate("/setlists");
                }}
              >
                <ListMusic size={13} /> Go to Setlists
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className='text-sm text-[var(--color-ink-soft)] mb-4'>
              Add <strong>"{song.title}"</strong> to:
            </p>
            <Select
              value={chosenSetlistId}
              onChange={(e) => setChosenSetlistId(e.target.value)}
              className='w-full'
            >
              <option value=''>Choose a setlist…</option>
              {setlists.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
            <div className='flex gap-2 justify-end mt-5'>
              <Button
                variant='secondary'
                size='sm'
                onClick={() => {
                  setAddToSetlistOpen(false);
                  setChosenSetlistId("");
                }}
              >
                Cancel
              </Button>
              <Button
                variant='primary'
                size='sm'
                loading={addingToSetlist}
                disabled={!chosenSetlistId}
                onClick={handleAddToSetlist}
              >
                <ListMusic size={13} /> Add to setlist
              </Button>
            </div>
          </>
        )}
      </Modal>

      {/* ── Edit Modal ────────────────────────────────────────────── */}
      {isEditing && (
        <EditSongModal
          song={song}
          onSave={async (updates) => {
            await update(updates);
            setIsEditing(false);
          }}
          onClose={() => setIsEditing(false)}
        />
      )}

      {/* ── Delete Modal ──────────────────────────────────────────── */}
      <Modal
        isOpen={deleteModal}
        onClose={() => setDeleteModal(false)}
        title='Delete song'
      >
        <p className='text-sm text-[var(--color-ink-soft)] mb-5'>
          Are you sure you want to delete <strong>"{song.title}"</strong>? This
          will also remove it from all setlists. This cannot be undone.
        </p>
        <div className='flex gap-2 justify-end'>
          <Button
            variant='secondary'
            size='sm'
            onClick={() => setDeleteModal(false)}
          >
            Cancel
          </Button>
          <Button
            variant='danger'
            size='sm'
            loading={deleting}
            onClick={async () => {
              setDeleting(true);
              try {
                await supabaseSongOps.delete(song.id);
                toast.success(`Deleted "${song.title}"`);
                navigate("/");
              } catch (e) {
                toast.error(e.message || "Delete failed");
                setDeleting(false);
                setDeleteModal(false);
              }
            }}
          >
            <Trash2 size={13} /> Delete
          </Button>
        </div>
      </Modal>

      {/* ── Save Key confirmation ─────────────────────────────────── */}
      <Modal
        isOpen={confirmSaveKey}
        onClose={() => setConfirmSaveKey(false)}
        title='Save key'
      >
        <p className='text-sm text-[var(--color-ink-soft)] mb-5'>
          Save <strong className='font-mono'>{displayKey}</strong> as this
          song's key? This rewrites the stored chords for everyone, it replaces
          the original key and can't be undone (you can transpose back and save
          again).
        </p>
        <div className='flex gap-2 justify-end'>
          <Button
            variant='secondary'
            size='sm'
            onClick={() => setConfirmSaveKey(false)}
          >
            Cancel
          </Button>
          <Button
            variant='primary'
            size='sm'
            loading={savingKey}
            onClick={handleSaveKey}
          >
            <KeyRound size={13} /> Save key
          </Button>
        </div>
      </Modal>
    </div>
  );
}

// ─── Edit Modal ────────────────────────────────────────────────────────────

function EditSongModal({ song, onSave, onClose }) {
  const [title, setTitle] = useState(song.title || "");
  const [artist, setArtist] = useState(song.artist || "");
  const [tags, setTags] = useState(song.tags || []);
  const [rawContent, setRawContent] = useState(song.raw_content || "");
  const [originalKey, setOriginalKey] = useState(song.original_key || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [lookingUpArtist, setLookingUpArtist] = useState(false);
  const [artistLookupMsg, setArtistLookupMsg] = useState("");

  // Live preview of re-parsed content
  const liveResult = rawContent.trim() ? ingest(rawContent, title) : null;

  const handleSave = async () => {
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({
        title: title.trim(),
        artist: artist.trim(),
        tags,
        raw_content: rawContent,
        original_key: originalKey || null,
      });
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  };

  return (
    <div className='fixed inset-0 z-50 flex items-start justify-center p-4 pt-8 overflow-y-auto'>
      <div
        className='absolute inset-0 bg-black/40 backdrop-blur-sm'
        onClick={onClose}
      />
      <div className='relative z-10 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg shadow-2xl w-full max-w-5xl animate-slide-up'>
        {/* Header */}
        <div className='flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)]'>
          <h2 className='text-sm font-semibold text-[var(--color-ink)]'>
            Edit Song
          </h2>
          <div className='flex items-center gap-2'>
            {error && <span className='text-xs text-red-500'>{error}</span>}
            <Button variant='secondary' size='sm' onClick={onClose}>
              <X size={13} /> Cancel
            </Button>
            <Button
              variant='primary'
              size='sm'
              onClick={handleSave}
              loading={saving}
            >
              <Save size={13} /> Save
            </Button>
          </div>
        </div>

        <div className='p-5 space-y-4'>
          {/* Metadata row */}
          <div className='grid grid-cols-2 sm:grid-cols-4 gap-3'>
            <Input
              label='Title *'
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className='sm:col-span-2'
              containerClassName='sm:col-span-2'
            />
            <div className='flex flex-col gap-1'>
              <label className='text-xs font-medium text-[var(--color-ink-soft)] uppercase tracking-wide'>
                Artist
              </label>
              <div className='flex gap-1.5'>
                <input
                  className='flex-1 h-8 px-2.5 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded text-[var(--color-ink)] placeholder-[var(--color-ink-muted)] hover:border-[var(--color-ink-muted)] focus:outline-none focus:border-[var(--color-ink)] transition-colors'
                  value={artist}
                  onChange={(e) => {
                    setArtist(e.target.value);
                    setArtistLookupMsg("");
                  }}
                />
                <Button
                  variant='secondary'
                  size='icon-sm'
                  title='Look up artist'
                  loading={lookingUpArtist}
                  disabled={!title.trim()}
                  onClick={async () => {
                    setLookingUpArtist(true);
                    setArtistLookupMsg("");
                    try {
                      const found = await lookupArtist(title);
                      if (found) {
                        setArtist(found);
                        setArtistLookupMsg("Found");
                      } else setArtistLookupMsg("Not found");
                    } catch {
                      setArtistLookupMsg("Error");
                    } finally {
                      setLookingUpArtist(false);
                    }
                  }}
                >
                  <Search size={13} />
                </Button>
              </div>
              {artistLookupMsg && (
                <p className='text-[10px] text-[var(--color-ink-muted)]'>
                  {artistLookupMsg}
                </p>
              )}
            </div>
            <Input
              label='Key (override)'
              value={originalKey}
              onChange={(e) => setOriginalKey(e.target.value)}
              placeholder='e.g. G'
            />
          </div>

          <div className='flex flex-col gap-1'>
            <label className='text-xs font-medium text-[var(--color-ink-soft)] uppercase tracking-wide'>
              Tags
            </label>
            <TagInput tags={tags} onChange={setTags} />
          </div>

          {/* Editor + Preview */}
          <div className='grid grid-cols-1 lg:grid-cols-2 gap-4'>
            <Textarea
              label='Chord sheet'
              value={rawContent}
              onChange={(e) => setRawContent(e.target.value)}
              className='h-[400px]'
              spellCheck={false}
              hint='Tip: start a line with "!" to add a performance cue, e.g. ! capo 2 here'
            />
            <div className='flex flex-col gap-2'>
              <label className='text-xs font-medium text-[var(--color-ink-soft)] uppercase tracking-wide'>
                Preview
              </label>
              <div className='border border-[var(--color-border)] rounded p-4 h-[400px] overflow-y-auto bg-[var(--color-bg)]'>
                {liveResult ? (
                  <SongRenderer parsedContent={liveResult.parsed_content} />
                ) : (
                  <p className='text-xs text-[var(--color-ink-muted)] italic'>
                    Edit the chord sheet to see changes.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── ChordSheetPage ────────────────────────────────────────────────────────
// Renders the chord sheet in an A4-proportioned container.
// Auto-detects overflow and switches to 2-column when content is tall.
// twoColumn: 'auto' | true | false

function ChordSheetPage({
  song,
  semitones,
  targetKey,
  twoColumn,
  printRef,
  fontSize = 14,
  onReload,
  onLineTypeOverride,
  onChordClick,
  nashville = false,
  voicings = false,
  voicingPreset = 0,
  voicingStore = null,
  onSaveVoicings = null,
}) {
  const measureRef = React.useRef(null);
  const [isOverflowing, setIsOverflowing] = React.useState(false);

  const A4_CONTENT_HEIGHT = 920;

  // Measure natural single-column height from a hidden mirror so the
  // measurement isn't contaminated when the visible content reflows into 2-col.
  React.useLayoutEffect(() => {
    if (!measureRef.current) return;
    const h = measureRef.current.scrollHeight || 0;
    setIsOverflowing(h > A4_CONTENT_HEIGHT);
  }, [song.parsed_content, semitones, fontSize]);

  const effectiveTwoCol =
    twoColumn === true || (twoColumn === "auto" && isOverflowing);

  return (
    <div
      ref={printRef}
      className='relative border border-[var(--color-border)] rounded-lg bg-[var(--color-bg)] overflow-hidden'
    >
      {/* Page header strip */}
      <div className='flex items-center justify-between px-5 py-2 border-b border-[var(--color-border)] bg-[var(--color-bg-warm)] no-print'>
        <span className='text-[10px] font-mono text-[var(--color-ink-muted)] uppercase tracking-widest'>
          {effectiveTwoCol ? "2 col" : "1 col"}
          {twoColumn === "auto" && (
            <span className='ml-1 opacity-60'>· auto</span>
          )}
          {isOverflowing && twoColumn === "auto" && (
            <span className='ml-2 opacity-60 normal-case tracking-normal'>
              exceeds one page
            </span>
          )}
        </span>
        <Tooltip content='Force reload from server'>
          <Button
            variant='ghost'
            size='icon-sm'
            onClick={onReload}
            title='Force reload'
          >
            <RefreshCw size={11} />
          </Button>
        </Tooltip>
      </div>

      {/* A4-proportioned content area */}
      <div
        className='p-8'
        style={{
          minHeight: `${A4_CONTENT_HEIGHT}px`,
        }}
      >
        <SongRenderer
          parsedContent={song.parsed_content}
          semitones={semitones}
          targetKey={targetKey}
          twoColumn={effectiveTwoCol}
          fontSize={fontSize}
          onLineTypeOverride={onLineTypeOverride}
          onChordClick={onChordClick}
          nashville={nashville}
          voicings={voicings}
          voicingPreset={voicingPreset}
          voicingStore={voicingStore}
          onSaveVoicings={onSaveVoicings}
        />
      </div>

      {/* Hidden single-column mirror used only to measure natural height.
          Kept in DOM (not display:none) so layout/scrollHeight is valid. */}
      <div
        aria-hidden='true'
        style={{
          position: "absolute",
          visibility: "hidden",
          pointerEvents: "none",
          left: "-9999px",
          top: 0,
          width: "100%",
        }}
      >
        <div ref={measureRef} className='p-8'>
          <SongRenderer
            parsedContent={song.parsed_content}
            semitones={semitones}
            targetKey={targetKey}
            twoColumn={false}
            fontSize={fontSize}
            nashville={nashville}
          />
        </div>
      </div>
    </div>
  );
}
