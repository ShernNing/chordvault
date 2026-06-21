import { useState, useMemo } from "react";
import { AlertTriangle, Edit3, X, Check } from "lucide-react";
import { ingest } from "../../lib/ingestion";
import { Input, Textarea, Button } from "../ui";
import SongRenderer from "./SongRenderer";

export default function ConflictCard({
  conflict,
  onChange,
  incomingLabel = "Importing",
}) {
  const {
    importedSong,
    existingSong,
    resolution,
    newTitle,
    incomingEdits,
    existingEdits,
  } = conflict;
  const [showEditor, setShowEditor] = useState(false);

  const [incTitle, setIncTitle] = useState(importedSong.title);
  const [incArtist, setIncArtist] = useState(importedSong.artist || "");
  const [incKey, setIncKey] = useState(importedSong.original_key || "");
  const [incContent, setIncContent] = useState(
    importedSong.rawContent || importedSong.raw_content || "",
  );

  const [exTitle, setExTitle] = useState(existingSong.title);
  const [exArtist, setExArtist] = useState(existingSong.artist || "");
  const [exKey, setExKey] = useState(existingSong.original_key || "");
  const [exContent, setExContent] = useState(existingSong.raw_content || "");

  const incPreview = useMemo(
    () => (incContent.trim() ? ingest(incContent, incTitle) : null),
    [incContent, incTitle],
  );
  const exPreview = useMemo(
    () => (exContent.trim() ? ingest(exContent, exTitle) : null),
    [exContent, exTitle],
  );

  const hasEdits = incomingEdits || existingEdits;

  const applyEdits = () => {
    onChange({
      incomingEdits: {
        title: incTitle,
        artist: incArtist,
        original_key: incKey,
        raw_content: incContent,
      },
      existingEdits: {
        title: exTitle,
        artist: exArtist,
        original_key: exKey,
        raw_content: exContent,
      },
    });
    setShowEditor(false);
  };

  const discardEdits = () => {
    setIncTitle(importedSong.title);
    setIncArtist(importedSong.artist || "");
    setIncKey(importedSong.original_key || "");
    setIncContent(importedSong.rawContent || importedSong.raw_content || "");
    setExTitle(existingSong.title);
    setExArtist(existingSong.artist || "");
    setExKey(existingSong.original_key || "");
    setExContent(existingSong.raw_content || "");
    onChange({ incomingEdits: null, existingEdits: null });
    setShowEditor(false);
  };

  const displayInc = incomingEdits ?? importedSong;
  const displayEx = existingEdits ?? existingSong;

  const resolutionOptions = [
    { value: "skip", label: `Skip ${incomingLabel.toLowerCase()}` },
    { value: "replace", label: "Replace existing" },
    { value: "keep-both", label: "Keep both" },
  ];

  return (
    <div className='border border-amber-300 dark:border-amber-700 rounded-lg overflow-hidden'>
      {/* Header */}
      <div className='flex items-center gap-2 px-4 py-2.5 bg-amber-50 dark:bg-amber-950 border-b border-amber-200 dark:border-amber-800'>
        <AlertTriangle size={13} className='text-amber-500 shrink-0' />
        <span className='text-sm font-semibold text-[var(--color-ink)]'>
          {displayInc.title}
        </span>
        {displayInc.artist && (
          <span className='text-xs text-[var(--color-ink-muted)]'>
            — {displayInc.artist}
          </span>
        )}
        {hasEdits && (
          <span className='ml-auto text-[10px] font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wide'>
            Edited
          </span>
        )}
      </div>

      {/* Collapsed summary */}
      {!showEditor && (
        <div className='grid grid-cols-2 divide-x divide-[var(--color-border)] text-xs'>
          <div className='p-3 bg-[var(--color-bg-warm)]'>
            <p className='font-medium text-[var(--color-ink-muted)] uppercase tracking-wide text-[10px] mb-1'>
              In library
            </p>
            <p className='font-medium text-[var(--color-ink)]'>
              {displayEx.title ?? existingSong.title}
            </p>
            <p className='text-[var(--color-ink-muted)]'>
              {displayEx.artist || existingSong.artist || (
                <span className='italic opacity-50'>no artist</span>
              )}
            </p>
          </div>
          <div className='p-3 bg-[var(--color-bg)]'>
            <p className='font-medium text-[var(--color-ink-muted)] uppercase tracking-wide text-[10px] mb-1'>
              {incomingLabel}
            </p>
            <p className='font-medium text-[var(--color-ink)]'>
              {displayInc.title ?? importedSong.title}
            </p>
            <p className='text-[var(--color-ink-muted)]'>
              {displayInc.artist || importedSong.artist || (
                <span className='italic opacity-50'>no artist</span>
              )}
            </p>
          </div>
        </div>
      )}

      {/* Side-by-side editor */}
      {showEditor && (
        <div className='p-4 border-b border-[var(--color-border)] bg-[var(--color-bg)]'>
          <div className='grid grid-cols-2 gap-4'>
            <div className='space-y-2'>
              <p className='text-[10px] font-semibold text-[var(--color-ink-muted)] uppercase tracking-wide border-b border-[var(--color-border)] pb-1'>
                In library
              </p>
              <Input
                label='Title'
                value={exTitle}
                onChange={(e) => setExTitle(e.target.value)}
              />
              <div className='grid grid-cols-2 gap-2'>
                <Input
                  label='Artist'
                  value={exArtist}
                  onChange={(e) => setExArtist(e.target.value)}
                />
                <Input
                  label='Key'
                  value={exKey}
                  onChange={(e) => setExKey(e.target.value)}
                  placeholder='e.g. G'
                />
              </div>
              <Textarea
                label='Chord sheet'
                value={exContent}
                onChange={(e) => setExContent(e.target.value)}
                className='h-44 font-mono text-xs'
                spellCheck={false}
              />
              {exPreview && (
                <div className='border border-[var(--color-border)] rounded p-2 max-h-36 overflow-y-auto bg-[var(--color-bg-warm)]'>
                  <SongRenderer
                    parsedContent={exPreview.parsed_content}
                    semitones={0}
                  />
                </div>
              )}
            </div>

            <div className='space-y-2'>
              <p className='text-[10px] font-semibold text-[var(--color-ink-muted)] uppercase tracking-wide border-b border-[var(--color-border)] pb-1'>
                {incomingLabel}
              </p>
              <Input
                label='Title'
                value={incTitle}
                onChange={(e) => setIncTitle(e.target.value)}
              />
              <div className='grid grid-cols-2 gap-2'>
                <Input
                  label='Artist'
                  value={incArtist}
                  onChange={(e) => setIncArtist(e.target.value)}
                />
                <Input
                  label='Key'
                  value={incKey}
                  onChange={(e) => setIncKey(e.target.value)}
                  placeholder='e.g. G'
                />
              </div>
              <Textarea
                label='Chord sheet'
                value={incContent}
                onChange={(e) => setIncContent(e.target.value)}
                className='h-44 font-mono text-xs'
                spellCheck={false}
              />
              {incPreview && (
                <div className='border border-[var(--color-border)] rounded p-2 max-h-36 overflow-y-auto bg-[var(--color-bg-warm)]'>
                  <SongRenderer
                    parsedContent={incPreview.parsed_content}
                    semitones={0}
                  />
                </div>
              )}
            </div>
          </div>

          <div className='flex items-center justify-between mt-3 pt-3 border-t border-[var(--color-border)]'>
            <button
              onClick={discardEdits}
              className='text-xs text-red-500 hover:text-red-600 transition-colors'
            >
              Discard edits
            </button>
            <div className='flex items-center gap-2'>
              <Button
                variant='ghost'
                size='sm'
                onClick={() => setShowEditor(false)}
              >
                <X size={13} /> Cancel
              </Button>
              <Button variant='primary' size='sm' onClick={applyEdits}>
                <Check size={13} /> Apply edits
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Resolution controls */}
      <div className='px-4 py-3 bg-[var(--color-bg)] border-t border-[var(--color-border)] space-y-2.5'>
        <div className='flex flex-wrap items-center gap-2'>
          {resolutionOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => onChange({ resolution: opt.value })}
              className={`px-3 py-1.5 rounded text-xs font-medium border transition-colors ${
                resolution === opt.value
                  ? "bg-[var(--color-ink)] text-[var(--color-bg)] border-[var(--color-ink)]"
                  : "border-[var(--color-border)] text-[var(--color-ink-soft)] hover:border-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
              }`}
            >
              {opt.label}
            </button>
          ))}

          <button
            onClick={() => setShowEditor((e) => !e)}
            className={`ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium border transition-colors ${
              showEditor
                ? "border-[var(--color-ink-muted)] text-[var(--color-ink)]"
                : hasEdits
                  ? "border-blue-400 text-blue-600 dark:border-blue-600 dark:text-blue-400"
                  : "border-[var(--color-border)] text-[var(--color-ink-soft)] hover:border-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
            }`}
          >
            <Edit3 size={11} />
            {showEditor
              ? "Hide editor"
              : hasEdits
                ? "Edit (modified)"
                : "Compare & Edit"}
          </button>
        </div>

        {resolution === "keep-both" && (
          <div className='flex items-center gap-2'>
            <span className='text-xs text-[var(--color-ink-muted)] shrink-0'>
              New title for {incomingLabel.toLowerCase()}:
            </span>
            <input
              type='text'
              value={newTitle}
              onChange={(e) => onChange({ newTitle: e.target.value })}
              className='flex-1 text-xs px-2 py-1.5 rounded border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-ink)] focus:outline-none focus:border-[var(--color-ink-muted)]'
            />
          </div>
        )}
      </div>
    </div>
  );
}
