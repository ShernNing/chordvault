import React, { useMemo, useState } from 'react'
import { Guitar, Eye, Type, LayoutGrid, Search, Star, ListTree, Sparkles, Hash, GitCompare, Wrench, GraduationCap } from 'lucide-react'
import VoicingGrid from '../components/voicings/VoicingGrid'
import ProgressionStrip from '../components/voicings/ProgressionStrip'
import ProgressionsLibrary from '../components/voicings/ProgressionsLibrary'
import CapoHelper from '../components/voicings/CapoHelper'
import CompareView from '../components/voicings/CompareView'
import PracticeMode from '../components/voicings/PracticeMode'
import VoicingEditor from '../components/voicings/VoicingEditor'
import AudioControls from '../components/voicings/AudioControls'
import { VOICINGS, VOICINGS_BY_CHORD, PROGRESSION_SETS, CHORD_ROOTS_IN_G } from '../lib/voicings/catalog'
import { transposeChordName, semitoneDelta, transposeVoicingTo } from '../lib/voicings/transpose'
import { keyPrefersFlats } from '../lib/voicings/notes'
import { useLocalStorage, useTheme } from '../lib/hooks'
import { useFavorites } from '../lib/voicings/favorites'
import { useUserVoicings } from '../lib/voicings/userVoicings'
import { DEFAULT_AUDIO_OPTIONS } from '../lib/voicings/audio'

const KEY_OPTIONS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']

const TABS = [
  { id: 'library',     label: 'Library',      icon: ListTree },
  { id: 'progressions', label: 'Progressions', icon: Sparkles },
  { id: 'capo',         label: 'Capo',         icon: Hash },
  { id: 'compare',      label: 'Compare',      icon: GitCompare },
  { id: 'practice',     label: 'Practice',     icon: GraduationCap },
  { id: 'custom',       label: 'Custom',       icon: Wrench },
]

export default function ChordVoicings() {
  const { isStage } = useTheme()
  const [tab, setTab] = useLocalStorage('chordvault-voicings-tab', 'library')

  const [displayKey, setDisplayKey] = useLocalStorage('chordvault-voicings-key', 'G')
  const [view, setView] = useLocalStorage('chordvault-voicings-view', 'chord')
  const [displayMode, setDisplayMode] = useLocalStorage('chordvault-voicings-display', 'both')

  const [highlightRoot, setHighlightRoot] = useLocalStorage('chordvault-voicings-highlightroot', true)
  const [dotLabels, setDotLabels] = useLocalStorage('chordvault-voicings-dotlabels', 'fret')
  const [showEnharmonic, setShowEnharmonic] = useLocalStorage('chordvault-voicings-enharmonic', false)

  const [search, setSearch] = useState('')
  const [difficulty, setDifficulty] = useLocalStorage('chordvault-voicings-difficulty', 'all')
  const [favoritesOnly, setFavoritesOnly] = useState(false)

  const [audioOptions, setAudioOptions] = useLocalStorage('chordvault-voicings-audio', DEFAULT_AUDIO_OPTIONS)
  const [showAudioPanel, setShowAudioPanel] = useState(false)

  const [activeChord, setActiveChord] = useState(null)

  const { ids: favoriteIds } = useFavorites()
  const { list: userVoicings } = useUserVoicings()

  const preferFlats = keyPrefersFlats(displayKey)
  const delta = useMemo(() => semitoneDelta('G', displayKey), [displayKey])

  // Combine catalog + user voicings, grouped by chord root.
  const allVoicingsByChord = useMemo(() => {
    const combined = { ...VOICINGS_BY_CHORD }
    for (const v of userVoicings) {
      const key = v.rootChord
      combined[key] = combined[key] ? [...combined[key], v] : [v]
    }
    return combined
  }, [userVoicings])

  const allChordRoots = useMemo(() => {
    const fromCatalog = CHORD_ROOTS_IN_G
    const fromUser = userVoicings.map(v => v.rootChord)
    return [...new Set([...fromCatalog, ...fromUser])]
  }, [userVoicings])

  const chordChips = useMemo(() => {
    return allChordRoots
      .map((root) => {
        const voicings = allVoicingsByChord[root] || []
        const displayableCount = voicings.reduce(
          (acc, v) => acc + (transposeVoicingTo(v, displayKey) != null ? 1 : 0),
          0,
        )
        return {
          rootChord: root,
          label: transposeChordName(root, delta, preferFlats),
          count: displayableCount,
        }
      })
      .filter(c => c.count > 0)
  }, [delta, preferFlats, displayKey, allChordRoots, allVoicingsByChord])

  const visibleChords = activeChord
    ? chordChips.filter(c => c.rootChord === activeChord)
    : chordChips

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 flex flex-col gap-5">
      {/* page header */}
      <header className="flex items-center gap-3 border-b border-[var(--color-border)] pb-4">
        <div className="w-9 h-9 rounded bg-[var(--color-bg-warm)] border border-[var(--color-border)] flex items-center justify-center">
          <Guitar size={18} className="text-[var(--color-ink-soft)]" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="font-display text-2xl text-[var(--color-ink)] leading-tight">Chord Voicings</h1>
          <p className="text-xs text-[var(--color-ink-soft)]">
            {VOICINGS.length} catalog voicings · {userVoicings.length} custom · 121 verified
          </p>
        </div>
      </header>

      {/* primary tabs */}
      <nav className="flex flex-wrap gap-1 border-b border-[var(--color-border)] -mb-1">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`
              flex items-center gap-1.5 px-3 h-9 text-sm font-medium transition-colors
              border-b-2 -mb-px
              ${tab === id
                ? 'border-[var(--color-accent)] text-[var(--color-ink)]'
                : 'border-transparent text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]'}
            `}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </nav>

      {/* ─────────── LIBRARY TAB ─────────── */}
      {tab === 'library' && (
        <>
          {/* toolbar row 1 — search + key + view + display */}
          <div className="flex flex-wrap items-end gap-3 bg-[var(--color-bg-warm)] border border-[var(--color-border)] rounded p-3">
            <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
              <label className="text-[10px] font-medium text-[var(--color-ink-soft)] uppercase tracking-wide">Search</label>
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-ink-muted)]" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="name, tag, shape…"
                  className="w-full h-8 pl-8 pr-2 text-sm rounded bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-ink)] placeholder:text-[var(--color-ink-muted)]"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium text-[var(--color-ink-soft)] uppercase tracking-wide">Key</label>
              <select
                value={displayKey}
                onChange={(e) => { setDisplayKey(e.target.value); setActiveChord(null) }}
                className="h-8 px-2 text-sm rounded bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-ink)]"
              >
                {KEY_OPTIONS.map(k => <option key={k} value={k}>{k}</option>)}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium text-[var(--color-ink-soft)] uppercase tracking-wide">View</label>
              <div className="inline-flex rounded border border-[var(--color-border)] overflow-hidden">
                {['chord', 'progression'].map((v, i) => (
                  <button
                    key={v}
                    onClick={() => setView(v)}
                    className={`h-8 px-3 text-xs font-medium transition-colors ${i > 0 ? 'border-l border-[var(--color-border)]' : ''} ${
                      view === v ? 'bg-[var(--color-ink)] text-[var(--color-bg)]' : 'bg-[var(--color-bg)] text-[var(--color-ink-soft)]'
                    }`}
                  >{v === 'chord' ? 'By Chord' : 'By Progression'}</button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium text-[var(--color-ink-soft)] uppercase tracking-wide">Display</label>
              <div className="inline-flex rounded border border-[var(--color-border)] overflow-hidden">
                {[
                  { id: 'svg',  icon: Eye },
                  { id: 'text', icon: Type },
                  { id: 'both', icon: LayoutGrid },
                ].map(({ id, icon: Icon }, idx) => (
                  <button
                    key={id}
                    onClick={() => setDisplayMode(id)}
                    className={`h-8 px-2 transition-colors ${idx > 0 ? 'border-l border-[var(--color-border)]' : ''} ${
                      displayMode === id ? 'bg-[var(--color-ink)] text-[var(--color-bg)]' : 'bg-[var(--color-bg)] text-[var(--color-ink-soft)]'
                    }`}
                  ><Icon size={14} /></button>
                ))}
              </div>
            </div>
          </div>

          {/* toolbar row 2 — filters */}
          <div className="flex flex-wrap items-center gap-3 px-1">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium text-[var(--color-ink-soft)] uppercase tracking-wide">Difficulty</label>
              <div className="inline-flex rounded border border-[var(--color-border)] overflow-hidden">
                {['all', 'easy', 'medium', 'hard'].map((d, i) => (
                  <button
                    key={d}
                    onClick={() => setDifficulty(d)}
                    className={`h-7 px-2 text-xs capitalize transition-colors ${i > 0 ? 'border-l border-[var(--color-border)]' : ''} ${
                      difficulty === d ? 'bg-[var(--color-ink)] text-[var(--color-bg)]' : 'bg-[var(--color-bg)] text-[var(--color-ink-soft)]'
                    }`}
                  >{d}</button>
                ))}
              </div>
            </div>

            <button
              onClick={() => setFavoritesOnly(f => !f)}
              className={`flex items-center gap-1.5 h-7 px-3 text-xs rounded border transition-colors ${
                favoritesOnly
                  ? 'bg-[var(--color-accent)] text-black border-[var(--color-accent)]'
                  : 'bg-[var(--color-bg)] border-[var(--color-border)] text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]'
              }`}
            >
              <Star size={12} fill={favoritesOnly ? 'currentColor' : 'none'} />
              Favorites only · {favoriteIds.length}
            </button>

            <button
              onClick={() => setHighlightRoot(r => !r)}
              className={`h-7 px-3 text-xs rounded border transition-colors ${
                highlightRoot ? 'bg-[var(--color-ink)] text-[var(--color-bg)] border-[var(--color-ink)]'
                              : 'bg-[var(--color-bg)] border-[var(--color-border)] text-[var(--color-ink-soft)]'
              }`}
            >Highlight root</button>

            <div className="inline-flex rounded border border-[var(--color-border)] overflow-hidden">
              {[
                { id: 'fret',     label: 'Frets' },
                { id: 'interval', label: 'Intervals' },
                { id: 'none',     label: 'Plain' },
              ].map(({ id, label }, idx) => (
                <button
                  key={id}
                  onClick={() => setDotLabels(id)}
                  className={`h-7 px-2 text-xs transition-colors ${idx > 0 ? 'border-l border-[var(--color-border)]' : ''} ${
                    dotLabels === id ? 'bg-[var(--color-ink)] text-[var(--color-bg)]' : 'bg-[var(--color-bg)] text-[var(--color-ink-soft)]'
                  }`}
                >{label}</button>
              ))}
            </div>

            <button
              onClick={() => setShowEnharmonic(s => !s)}
              className={`h-7 px-3 text-xs rounded border transition-colors ${
                showEnharmonic ? 'bg-[var(--color-ink)] text-[var(--color-bg)] border-[var(--color-ink)]'
                               : 'bg-[var(--color-bg)] border-[var(--color-border)] text-[var(--color-ink-soft)]'
              }`}
            >Show enharmonics</button>

            <button
              onClick={() => setShowAudioPanel(p => !p)}
              className={`h-7 px-3 text-xs rounded border transition-colors ${
                showAudioPanel ? 'bg-[var(--color-ink)] text-[var(--color-bg)] border-[var(--color-ink)]'
                               : 'bg-[var(--color-bg)] border-[var(--color-border)] text-[var(--color-ink-soft)]'
              }`}
            >Audio…</button>
          </div>

          {showAudioPanel && (
            <div className="bg-[var(--color-bg-warm)] border border-[var(--color-border)] rounded p-3">
              <AudioControls value={audioOptions} onChange={setAudioOptions} />
            </div>
          )}

          {view === 'chord' && (
            <>
              {/* chord chips */}
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setActiveChord(null)}
                  className={`h-8 px-3 text-xs rounded-full border ${
                    activeChord == null
                      ? 'bg-[var(--color-ink)] text-[var(--color-bg)] border-[var(--color-ink)]'
                      : 'bg-[var(--color-bg)] text-[var(--color-ink-soft)] border-[var(--color-border)] hover:border-[var(--color-ink-muted)]'
                  }`}
                >All</button>
                {chordChips.map(c => (
                  <button
                    key={c.rootChord}
                    onClick={() => setActiveChord(c.rootChord)}
                    className={`h-8 px-3 text-xs rounded-full border ${
                      activeChord === c.rootChord
                        ? 'bg-[var(--color-ink)] text-[var(--color-bg)] border-[var(--color-ink)]'
                        : 'bg-[var(--color-bg)] text-[var(--color-ink-soft)] border-[var(--color-border)] hover:border-[var(--color-ink-muted)]'
                    }`}
                  >
                    {c.label}
                    <span className="ml-1 text-[var(--color-ink-muted)]">{c.count}</span>
                  </button>
                ))}
              </div>

              <div className="flex flex-col gap-8">
                {visibleChords.map(({ rootChord, label }) => {
                  const voicings = allVoicingsByChord[rootChord] || []
                  if (voicings.length === 0) return null
                  return (
                    <section key={rootChord} className="flex flex-col gap-3">
                      <h2 className="font-display text-xl text-[var(--color-ink)] border-b border-[var(--color-border)] pb-1">
                        {label}
                      </h2>
                      <VoicingGrid
                        voicings={voicings}
                        displayKey={displayKey}
                        displayMode={displayMode}
                        highlightRoot={highlightRoot}
                        dotLabels={dotLabels}
                        stageMode={isStage}
                        showEnharmonic={showEnharmonic}
                        audioOptions={audioOptions}
                        searchQuery={search}
                        difficulty={difficulty}
                        favoritesOnly={favoritesOnly}
                        favoriteIds={favoriteIds}
                      />
                    </section>
                  )
                })}
              </div>
            </>
          )}

          {view === 'progression' && (
            <div className="flex flex-col gap-8">
              {PROGRESSION_SETS.map(set => (
                <ProgressionStrip
                  key={set.id}
                  set={set}
                  displayKey={displayKey}
                  displayMode={displayMode}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* ─────────── OTHER TABS ─────────── */}
      {tab === 'progressions' && <ProgressionsLibrary displayMode={displayMode} highlightRoot={highlightRoot} />}
      {tab === 'capo'         && <CapoHelper displayMode={displayMode} />}
      {tab === 'compare'      && <CompareView />}
      {tab === 'practice'     && <PracticeMode />}
      {tab === 'custom'       && <VoicingEditor />}
    </div>
  )
}
