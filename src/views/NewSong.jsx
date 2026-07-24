import { useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import {
  AlertTriangle,
  CheckCircle,
  Eye,
  EyeOff,
  Save,
  X,
  Search,
  Lock,
  ImageUp,
} from "lucide-react";
import { useSongs } from "../lib/hooks";
import { useAuth } from "../lib/AuthContext";
import { supabaseSongOps } from "../lib/supabaseOps";
import { ingest, classifyLine, cleanArtistName } from "../lib/ingestion";
import {
  Button,
  Input,
  Textarea,
  TagInput,
  Badge,
  EmptyState,
} from "../components/ui";
import { lookupArtist } from "../lib/musicbrainz";
import SongRenderer from "../components/song/SongRenderer";
import ConflictCard from "../components/song/ConflictCard";
import {
  motion,
  AnimatePresence,
  AnimatedNumber,
  Reveal,
  ease,
} from "../lib/motion";
import { useToast } from "../lib/toast";

export default function NewSong() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { createSong, songs } = useSongs();
  const toast = useToast();
  const { canAddSongs } = useAuth();

  const [title, setTitle] = useState(searchParams.get("title") || "");
  const [artist, setArtist] = useState(searchParams.get("artist") || "");
  const [tags, setTags] = useState([]);
  const [rawContent, setRawContent] = useState(
    searchParams.get("content") || "",
  );
  const [showPreview, setShowPreview] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [conflict, setConflict] = useState(null); // { importedSong, existingSong, resolution, newTitle, incomingEdits, existingEdits }
  const fromTransposeMe = !!(
    searchParams.get("title") || searchParams.get("content")
  );
  const [titleAutoDetected, setTitleAutoDetected] = useState(false);
  const [artistAutoDetected, setArtistAutoDetected] = useState(false);
  const [lookingUpArtist, setLookingUpArtist] = useState(false);
  const [artistLookupMsg, setArtistLookupMsg] = useState("");
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);

  // Live parse result
  const ingestionResult = rawContent.trim() ? ingest(rawContent, title) : null;

  const handlePhotoImport = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    setOcrBusy(true);
    setOcrProgress(0);
    setError(null);
    try {
      const { recognizeImage } = await import("../lib/ocr");
      const text = await recognizeImage(file, setOcrProgress);
      if (!text) {
        setError("No text found in that image. Try a clearer, straighter photo.");
        return;
      }
      // Append beneath existing content so a multi-page shot can be added up.
      setRawContent((prev) => (prev.trim() ? `${prev.trimEnd()}\n\n${text}` : text));
      toast.success("Text extracted from photo — check and tidy it up");
    } catch (err) {
      setError(`Photo import failed: ${err?.message || err}`);
    } finally {
      setOcrBusy(false);
      setOcrProgress(0);
    }
  };

  const handleRawContentChange = (e) => {
    let content = e.target.value;

    // Auto-detect title (and optionally artist) from first non-blank line when title is empty.
    // Handles formats like:
    //   "2. TRIBES – Victory Worship (G)"  → title=TRIBES, artist=Victory Worship
    //   "1. Amazing Grace (F)"             → title=Amazing Grace
    //   "Lord I Need You (F)"              → title=Lord I Need You
    const isCategoryLabel = (line) =>
      /^(?:\d+[.)]\s*)?(?:communion|post[\s-]?sermon)\s*$/i.test(line.trim());

    if (!title.trim() && content.trim()) {
      const contentLines = content.split("\n");
      let firstIdx = contentLines.findIndex((l) => l.trim());

      // Skip category labels (Communion, Post Sermon, etc.) to reach the actual song title
      while (firstIdx !== -1 && isCategoryLabel(contentLines[firstIdx])) {
        contentLines.splice(firstIdx, 1);
        firstIdx = contentLines.findIndex((l, i) => i >= firstIdx && l.trim());
      }

      if (firstIdx !== -1) {
        const firstLine = contentLines[firstIdx].trim();
        if (
          classifyLine(firstLine) === "lyric_line" &&
          firstLine.length > 1 &&
          firstLine.length < 120
        ) {
          // Artist extraction: key annotation OR em/en-dash (–—) as strong separator signal
          const artistWithKey = firstLine.match(
            /[–-]\s*([^(–-]+?)\s*\((?:Key\s*)?[A-G][#b]?\s*(?:m(?:in(?:or)?)?|maj(?:or)?)?\s*\)/i,
          );
          const artistEmDash =
            !artistWithKey && firstLine.match(/[–—]\s*([^–—(]+?)\s*$/);
          const detectedArtist = cleanArtistName(
            artistWithKey?.[1] || artistEmDash?.[1] || "",
          );

          let detected = firstLine
            .replace(
              /\s*\((?:Key\s*)?[A-G][#b]?\s*(?:m(?:in(?:or)?)?|maj(?:or)?)?\s*\)\s*$/i,
              "",
            )
            .replace(/^\d+[.)]\s+/, "")
            .trim();

          // Strip artist credit from title
          if (detectedArtist) {
            detected = detected.replace(/\s*[–-]\s*.+$/, "").trim();
          }

          // Normalize casing only when all-caps or all-lowercase; keep intentional mixed casing
          const hasLower = /[a-z]/.test(detected);
          const hasUpper = /[A-Z]/.test(detected);
          if (!hasLower || !hasUpper) {
            detected = detected.replace(
              /\S+/g,
              (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(),
            );
          }

          if (detected.length > 0) {
            setTitle(detected);
            setTitleAutoDetected(true);
            if (detectedArtist && !artist.trim()) {
              setArtist(detectedArtist);
              setArtistAutoDetected(true);
            }
            contentLines.splice(firstIdx, 1);
            while (contentLines.length > 0 && !contentLines[0].trim())
              contentLines.shift();
            content = contentLines.join("\n");
          }
        }
      }
    }

    setRawContent(content);
  };

  const handleSave = async () => {
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    if (!rawContent.trim()) {
      setError("Chord sheet content is required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const dupes = await supabaseSongOps.getByTitles([title.trim()]);
      if (dupes.length > 0) {
        setConflict({
          importedSong: {
            title: title.trim(),
            artist: artist.trim(),
            rawContent,
            original_key: null,
          },
          existingSong: dupes[0],
          resolution: "skip",
          newTitle: title.trim() + " (2)",
          incomingEdits: null,
          existingEdits: null,
        });
        setSaving(false);
        return;
      }
      const wasEmpty = songs.length === 0;
      const { song } = await createSong(
        rawContent,
        title.trim(),
        artist.trim(),
        tags,
      );
      if (wasEmpty) toast.celebrate();
      toast.success(`Saved "${title.trim()}"`);
      navigate(`/songs/${song.id}`);
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  };

  const handleConflictConfirm = async () => {
    if (!conflict) return;
    setSaving(true);
    setError(null);
    try {
      const ie = conflict.incomingEdits;
      const incRaw = ie?.raw_content ?? rawContent;
      const incTitle = ie?.title ?? title.trim();
      const incArtist = ie?.artist ?? artist.trim();
      const incKey = ie?.original_key ?? null;
      const parsed = ingest(incRaw, incTitle);

      const applyExistingEdits = async () => {
        const ee = conflict.existingEdits;
        if (!ee) return;
        const exParsed = ee.raw_content
          ? ingest(ee.raw_content, ee.title)
          : null;
        await supabaseSongOps.update(conflict.existingSong.id, {
          title: ee.title,
          artist: ee.artist,
          original_key: ee.original_key,
          raw_content: ee.raw_content,
          ...(exParsed ? { parsed_content: exParsed.parsed_content } : {}),
        });
      };

      if (conflict.resolution === "replace") {
        await supabaseSongOps.update(conflict.existingSong.id, {
          title: incTitle,
          artist: incArtist,
          original_key: incKey || parsed.original_key,
          raw_content: incRaw,
          parsed_content: parsed.parsed_content,
          tags,
        });
        navigate(`/songs/${conflict.existingSong.id}`);
      } else if (conflict.resolution === "keep-both") {
        const { song } = await createSong(
          incRaw,
          conflict.newTitle || incTitle + " (2)",
          incArtist,
          tags,
        );
        await applyExistingEdits();
        navigate(`/songs/${song.id}`);
      } else {
        // skip, still save any existing edits
        await applyExistingEdits();
        setConflict(null);
        setSaving(false);
      }
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  };

  if (conflict) {
    return (
      <div className='max-w-2xl mx-auto space-y-5 animate-fade-in'>
        <div>
          <div className='flex items-center gap-2 mb-1'>
            <AlertTriangle size={16} className='text-amber-500' />
            <h1 className='font-display text-2xl text-[var(--color-ink)]'>
              Song already exists
            </h1>
          </div>
          <p className='text-sm text-[var(--color-ink-soft)]'>
            A song with this title is already in your library. Choose what to
            do.
          </p>
        </div>

        <ConflictCard
          conflict={conflict}
          onChange={(updates) =>
            setConflict((prev) => ({ ...prev, ...updates }))
          }
          incomingLabel='Adding'
        />

        <div className='flex items-center justify-between pt-2 border-t border-[var(--color-border)]'>
          <Button variant='ghost' size='sm' onClick={() => setConflict(null)}>
            <X size={13} /> Back to editing
          </Button>
          <Button
            variant='primary'
            size='sm'
            loading={saving}
            onClick={handleConflictConfirm}
          >
            <Save size={13} /> Confirm
          </Button>
        </div>

        {error && (
          <div className='flex items-center gap-2 p-3 border border-red-200 bg-red-50 rounded text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300'>
            <AlertTriangle size={14} /> {error}
          </div>
        )}
      </div>
    );
  }

  if (!canAddSongs) return <NoAddPermission />;

  return (
    <div className='max-w-4xl mx-auto space-y-5'>
      {/* Header */}
      <div className='flex items-center justify-between'>
        <h1 className='font-display text-2xl text-[var(--color-ink)]'>
          Add Song
        </h1>
        <Button
          variant='primary'
          size='sm'
          onClick={handleSave}
          loading={saving}
          disabled={!title.trim() || !rawContent.trim()}
        >
          <Save size={14} /> Save song
        </Button>
      </div>

      {fromTransposeMe && (
        <div className='flex items-center gap-2 p-3 border border-blue-200 bg-blue-50 rounded text-sm text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300'>
          <CheckCircle size={14} />
          Pre-filled from TransposeMe, review and save.
        </div>
      )}

      {error && (
        <div className='flex items-center gap-2 p-3 border border-red-200 bg-red-50 rounded text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300'>
          <AlertTriangle size={14} />
          {error}
        </div>
      )}

      {/* Metadata */}
      <div className='grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 border border-[var(--color-border)] rounded-lg bg-[var(--color-bg-warm)]'>
        <div className='flex flex-col gap-1'>
          <Input
            label='Song title *'
            placeholder='e.g. Amazing Grace'
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setTitleAutoDetected(false);
            }}
          />
          {titleAutoDetected && (
            <p className='text-[10px] text-[var(--color-ink-muted)]'>
              Title auto-detected from content
            </p>
          )}
        </div>
        <div className='flex flex-col gap-1'>
          <label className='text-xs font-medium text-[var(--color-ink-soft)] uppercase tracking-wide'>
            Artist / Songwriter
          </label>
          <div className='flex gap-1.5'>
            <input
              className='flex-1 h-8 px-2.5 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded text-[var(--color-ink)] placeholder-[var(--color-ink-muted)] hover:border-[var(--color-ink-muted)] focus:outline-none focus:border-[var(--color-ink)] transition-colors'
              placeholder='e.g. John Newton'
              value={artist}
              onChange={(e) => {
                setArtist(e.target.value);
                setArtistAutoDetected(false);
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
          {artistAutoDetected && !artistLookupMsg && (
            <p className='text-[10px] text-[var(--color-ink-muted)]'>
              Artist auto-detected from content
            </p>
          )}
          {artistLookupMsg && (
            <p className='text-[10px] text-[var(--color-ink-muted)]'>
              {artistLookupMsg}
            </p>
          )}
        </div>
        <div className='sm:col-span-2 flex flex-col gap-1'>
          <label className='text-xs font-medium text-[var(--color-ink-soft)] uppercase tracking-wide'>
            Tags
          </label>
          <TagInput
            tags={tags}
            onChange={setTags}
            placeholder='worship, sunday, fast…'
          />
        </div>
      </div>

      {/* Editor + Preview */}
      <div className='grid grid-cols-1 lg:grid-cols-2 gap-4'>
        {/* Raw editor */}
        <div className='flex flex-col gap-2'>
          <div className='flex items-center justify-between gap-2'>
            <label className='text-xs font-medium text-[var(--color-ink-soft)] uppercase tracking-wide'>
              Paste chord sheet
            </label>
            <div className='flex items-center gap-2'>
              <label
                className={`flex items-center gap-1 px-2 h-7 text-[11px] rounded border cursor-pointer transition-colors ${
                  ocrBusy
                    ? "border-[var(--color-border)] text-[var(--color-ink-muted)] cursor-wait"
                    : "border-[var(--color-border)] text-[var(--color-ink-soft)] hover:text-[var(--color-ink)] hover:border-[var(--color-accent)]"
                }`}
                title='Extract text from a photo of a chord sheet (runs on your device)'
              >
                <ImageUp size={12} />
                {ocrBusy
                  ? `Reading… ${Math.round(ocrProgress * 100)}%`
                  : "Import from photo"}
                <input
                  type='file'
                  accept='image/*'
                  className='hidden'
                  disabled={ocrBusy}
                  onChange={handlePhotoImport}
                />
              </label>
              {ingestionResult && <IngestionStatus result={ingestionResult} />}
            </div>
          </div>
          <Textarea
            value={rawContent}
            onChange={handleRawContentChange}
            placeholder={PASTE_PLACEHOLDER}
            className='h-[500px] leading-relaxed'
            spellCheck={false}
          />
          <p className='text-[10px] text-[var(--color-ink-muted)]'>
            Supports standard chord-above-lyric format and inline [chord]
            format. Chords are detected automatically.
          </p>
        </div>

        {/* Live preview */}
        <div className='flex flex-col gap-2'>
          <div className='flex items-center justify-between'>
            <label className='text-xs font-medium text-[var(--color-ink-soft)] uppercase tracking-wide'>
              Preview
            </label>
            <Button
              variant='ghost'
              size='xs'
              onClick={() => setShowPreview((p) => !p)}
            >
              {showPreview ? <EyeOff size={12} /> : <Eye size={12} />}
              {showPreview ? "Hide" : "Show"}
            </Button>
          </div>

          <AnimatePresence initial={false}>
            {showPreview && (
              <motion.div
                key='preview'
                className='border border-[var(--color-border)] rounded-lg p-4 bg-[var(--color-bg)] h-[500px] overflow-y-auto'
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }}
                transition={ease}
              >
                {ingestionResult ? (
                  <SongRenderer
                    parsedContent={ingestionResult.parsed_content}
                    onLineTypeOverride={(_idx, _type) => {
                      // In live preview mode, overrides are visual only
                      // They'll be saved when the user saves the song
                    }}
                  />
                ) : (
                  <p className='text-xs text-[var(--color-ink-muted)] italic'>
                    Start typing or paste a chord sheet on the left to see the
                    preview.
                  </p>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Key detection result */}
          {ingestionResult?.original_key && (
            <Reveal className='flex items-center gap-2 p-2 border border-[var(--color-border)] rounded text-xs bg-[var(--color-bg-warm)]'>
              <span className='text-[var(--color-ink-muted)]'>
                Detected key:
              </span>
              <Badge variant='key'>{ingestionResult.original_key}</Badge>
              {ingestionResult.detected_key?.confidence && (
                <span className='text-[var(--color-ink-muted)]'>
                  (
                  <AnimatedNumber
                    value={Math.round(
                      ingestionResult.detected_key.confidence * 100,
                    )}
                  />
                  % confidence)
                </span>
              )}
              {ingestionResult.key_mismatch && (
                <Badge variant='warning'>⚠ Mismatch with title</Badge>
              )}
            </Reveal>
          )}
        </div>
      </div>
    </div>
  );
}

function IngestionStatus({ result }) {
  const warnings = result.uncertain_line_count + (result.key_mismatch ? 1 : 0);
  if (warnings === 0) {
    return (
      <span className='flex items-center gap-1 text-[10px] text-green-600 dark:text-green-400'>
        <CheckCircle size={11} /> Parsed OK
      </span>
    );
  }
  return (
    <span className='flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400'>
      <AlertTriangle size={11} /> {warnings}{" "}
      {warnings === 1 ? "warning" : "warnings"}
    </span>
  );
}

const PASTE_PLACEHOLDER = `[Verse 1]
G              Em
Amazing grace how sweet the sound
C              G
That saved a wretch like me

[Chorus]
G
I once was lost
C          G
But now am found`;

// Shown to members, who can't add songs (see ROLES.md).
function NoAddPermission() {
  return (
    <EmptyState
      icon={Lock}
      title='Adding songs is leader-only'
      description='Your account is a member, so you can view chords and build setlists but not add songs. Ask a superuser to make you a leader.'
      action={
        <Link to='/'>
          <span className='text-xs text-[var(--color-accent)]'>
            ← Back to library
          </span>
        </Link>
      }
    />
  );
}
