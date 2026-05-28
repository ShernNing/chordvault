import React from 'react'
import { fretInterval, isRootFret, rootPCOf } from '../../lib/voicings/intervals'
import { sharedStringMask } from '../../lib/voicings/voiceLeading'

const NUM_STRINGS = 6
const DEFAULT_SPAN = 5

/**
 * Vertical-orientation fretboard diagram (low E left → high E right).
 *
 * Props:
 *   frets:           [lowE, A, D, G, B, highE] — null = mute, 0 = open, N = fret
 *   width:           pixels — used as max-width; SVG fills container by default
 *   responsive:      when true (default), SVG width=100% so it scales to container
 *   showLabels:      string letter labels under diagram
 *   highlightRoot:   ring the root note in accent color
 *   chordName:       used to compute root for highlight + intervals
 *   dotLabels:       'fret' (default) | 'interval' | 'none'
 *   compareFrets:    if supplied, strings shared with this voicing get a halo
 *   stageMode:       larger high-contrast rendering for live use
 */
export default function FretboardDiagram({
  frets,
  width = 130,
  responsive = true,
  showLabels = false,
  className = '',
  highlightRoot = false,
  chordName = null,
  dotLabels = 'fret',
  compareFrets = null,
  stageMode = false,
}) {
  if (!frets || frets.length !== NUM_STRINGS) return null

  const playedFrets = frets.filter(f => f != null && f > 0)
  const hasOpen = frets.some(f => f === 0)
  const minPlayed = playedFrets.length ? Math.min(...playedFrets) : 1
  const maxPlayed = playedFrets.length ? Math.max(...playedFrets) : 1

  const anchorAtNut = hasOpen || minPlayed <= 4
  const startFret = anchorAtNut ? 1 : minPlayed
  const span = Math.max(DEFAULT_SPAN, maxPlayed - startFret + 1)

  // geometry — scale up in stage mode
  const scale = stageMode ? 1.6 : 1
  const padTop = 18 * scale
  const padBottom = (showLabels ? 16 : 4) * scale
  // widen left pad when position label has 2+ digits ("12fr", "16fr")
  const positionDigits = anchorAtNut ? 0 : String(startFret).length
  const padLeft = (anchorAtNut ? 16 : 22 + positionDigits * 6) * scale
  const padRight = 16 * scale
  const innerWidth = width * scale - padLeft - padRight
  const stringSpacing = innerWidth / (NUM_STRINGS - 1)
  const fretHeight = stringSpacing
  const innerHeight = fretHeight * span
  const totalWidth = width * scale
  const totalHeight = padTop + innerHeight + padBottom

  const stringX = (i) => padLeft + i * stringSpacing
  const fretY = (off) => padTop + off * fretHeight

  const strokeMain = stageMode ? '#888' : 'var(--color-ink-soft)'
  const strokeNut = stageMode ? '#fff' : 'var(--color-ink)'
  const dotFill = stageMode ? 'var(--color-accent)' : 'var(--color-accent)'
  const rootRingColor = stageMode ? '#fff' : 'var(--color-ink)'
  const muteColor = stageMode ? '#888' : 'var(--color-ink-muted)'
  const labelColor = stageMode ? '#bbb' : 'var(--color-ink-soft)'
  const sharedHalo = '#22c55e'   // green halo for voice-leading shared strings

  const rootPC = highlightRoot || dotLabels === 'interval' ? rootPCOf(chordName) : null
  const shared = compareFrets ? sharedStringMask(compareFrets, frets) : null

  const baseFontSize = 10 * scale
  const muteFontSize = 13 * scale
  const labelFontSize = 11 * scale
  // dot radius capped so edge-string dots fit within padLeft/padRight
  const dotR = Math.min(stringSpacing * 0.36, padLeft - 2, padRight - 2, 9 * scale)
  // fret lines extend past edge strings by dotR so circles look contained
  const fretLeft = padLeft - dotR - 1
  const fretRight = padLeft + innerWidth + dotR + 1

  return (
    <svg
      width={responsive ? '100%' : totalWidth}
      height={responsive ? undefined : totalHeight}
      viewBox={`0 0 ${totalWidth} ${totalHeight}`}
      preserveAspectRatio="xMidYMid meet"
      style={responsive ? { maxWidth: totalWidth, display: 'block' } : undefined}
      className={className}
      role="img"
      aria-label={`Chord diagram, frets ${frets.map(f => f == null ? 'x' : f).join(' ')}`}
    >
      {/* strings (vertical) */}
      {Array.from({ length: NUM_STRINGS }, (_, i) => (
        <line
          key={`s${i}`}
          x1={stringX(i)} y1={padTop}
          x2={stringX(i)} y2={padTop + innerHeight}
          stroke={strokeMain} strokeWidth={1}
        />
      ))}

      {/* frets (horizontal) — extended past edge strings to contain dots */}
      {Array.from({ length: span + 1 }, (_, f) => {
        const isNut = anchorAtNut && f === 0
        return (
          <line
            key={`f${f}`}
            x1={fretLeft} y1={fretY(f)}
            x2={fretRight} y2={fretY(f)}
            stroke={isNut ? strokeNut : strokeMain}
            strokeWidth={isNut ? 3 : 1}
          />
        )
      })}

      {/* position label */}
      {!anchorAtNut && (
        <text
          x={padLeft - 4 * scale} y={fretY(0) + fretHeight / 2 + 3}
          textAnchor="end"
          fontSize={labelFontSize}
          fill={labelColor}
          fontFamily="ui-sans-serif, system-ui, sans-serif"
        >
          {startFret}fr
        </text>
      )}

      {/* dots + markers */}
      {frets.map((f, i) => {
        const x = stringX(i)
        if (f == null) {
          return (
            <text
              key={`m${i}`}
              x={x} y={padTop - 4 * scale}
              textAnchor="middle"
              fontSize={muteFontSize}
              fill={muteColor}
              fontFamily="ui-sans-serif, system-ui, sans-serif"
              fontWeight="600"
            >×</text>
          )
        }
        const isOpen = f === 0
        const isRoot = rootPC != null && isRootFret(i, f, rootPC)
        const isShared = shared && shared[i]

        // open string marker
        if (isOpen) {
          return (
            <g key={`m${i}`}>
              {isShared && (
                <circle cx={x} cy={padTop - 6 * scale} r={5 * scale} fill="none" stroke={sharedHalo} strokeWidth={2} opacity={0.6} />
              )}
              <circle
                cx={x} cy={padTop - 6 * scale}
                r={3.2 * scale}
                fill={isRoot && highlightRoot ? rootRingColor : 'none'}
                stroke={isRoot && highlightRoot ? rootRingColor : muteColor}
                strokeWidth={1}
              />
            </g>
          )
        }

        // fretted dot
        const off = f - startFret
        if (off < 0 || off >= span) return null
        const cy = fretY(off) + fretHeight / 2

        const labelText = dotLabels === 'interval' && rootPC != null
          ? fretInterval(i, f, rootPC)
          : dotLabels === 'none' ? '' : String(f)

        const fontSize = labelText.length > 2 ? baseFontSize * 0.85 : baseFontSize

        return (
          <g key={`m${i}`}>
            {isShared && (
              <circle cx={x} cy={cy} r={dotR + 3 * scale} fill="none" stroke={sharedHalo} strokeWidth={2} opacity={0.6} />
            )}
            <circle
              cx={x} cy={cy} r={dotR}
              fill={dotFill}
              stroke={isRoot && highlightRoot ? rootRingColor : 'var(--color-ink)'}
              strokeWidth={isRoot && highlightRoot ? 2.5 : 1}
            />
            {labelText && (
              <text
                x={x} y={cy + fontSize * 0.36}
                textAnchor="middle"
                fontSize={fontSize}
                fill="#000"
                fontFamily="ui-sans-serif, system-ui, sans-serif"
                fontWeight="800"
              >{labelText}</text>
            )}
          </g>
        )
      })}

      {/* string letter labels */}
      {showLabels && (
        ['E', 'A', 'D', 'G', 'B', 'e'].map((label, i) => (
          <text
            key={`l${i}`}
            x={stringX(i)} y={padTop + innerHeight + 11 * scale}
            textAnchor="middle"
            fontSize={baseFontSize}
            fill={labelColor}
            fontFamily="ui-sans-serif, system-ui, sans-serif"
          >{label}</text>
        ))
      )}
    </svg>
  )
}
