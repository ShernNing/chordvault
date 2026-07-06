/**
 * Regression tests for the print-layout invariant that broke setlist PDF export
 * (songs sliced mid-verse across pages + phantom 16px gap after song titles).
 *
 * INVARIANT: every band rendered by PrintPage must be exactly ONE element in
 * the page's flex band stack. If a song component returns a fragment with
 * multiple top-level children, the stack's `gap:16px` is injected INSIDE the
 * song (between title and chords, between sections), and the rendered height
 * no longer matches the measurement pass (which renders into a plain block
 * div) — so packPages overfills pages and html2canvas slices songs across
 * PDF page boundaries.
 *
 * See docs/superpowers/specs/2026-07-01-pdf-export-packing-redesign-design.md
 * ("Measure/render parity invariants").
 */
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  PrintPage,
  SongSheetBody,
  SingleSongForColumn,
  SegmentHeading,
} from "./SongRenderer";
import { parseRawContent } from "../../lib/ingestion";

const SHORT_SONG = `[Verse]
G       C
Lyric line one
D       Em
Lyric line two

[Chorus]
C       G
Chorus line one
D       G
Chorus line two`;

// >45 non-blank lines so SongSheetBody takes its internal 2-column branch.
const LONG_SONG = Array.from(
  { length: 25 },
  (_, i) => `[Section ${i}]\nG       C\nLyric line ${i}`,
).join("\n\n");

function makeSong(raw) {
  return {
    id: "s1",
    title: "Test Song",
    artist: "Tester",
    original_key: "G",
    parsed_content: parseRawContent(raw),
  };
}

const songProps = (raw) => ({
  song: makeSong(raw),
  semitones: 0,
  targetKey: "G",
  keyLabel: "G",
  songNumber: 1,
});

/**
 * Count element children directly inside the element at `parentDepth`
 * (1 = outermost element of the markup). renderToStaticMarkup escapes text
 * and attribute values, so a plain tag walk is safe here.
 */
function childCountAtDepth(markup, parentDepth) {
  const tagRe = /<(\/)?([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/)?>/g;
  let depth = 0;
  let count = 0;
  let m;
  while ((m = tagRe.exec(markup))) {
    const closing = Boolean(m[1]);
    const selfClosing = Boolean(m[4]);
    if (closing) {
      depth--;
    } else {
      depth++;
      if (depth === parentDepth + 1) count++;
      if (selfClosing) depth--;
    }
  }
  return count;
}

describe("PrintPage band stack invariant (one flex child per band)", () => {
  // PrintPage markup: wrapper div (depth 1) > band stack div (depth 2) > bands.
  const stackChildren = (bands) =>
    childCountAtDepth(renderToStaticMarkup(<PrintPage bands={bands} />), 2);

  it("renders a single-column full band as ONE stack child", () => {
    expect(stackChildren([{ type: "full", item: songProps(SHORT_SONG) }])).toBe(
      1,
    );
  });

  it("renders an internally-2-col full band as ONE stack child", () => {
    expect(stackChildren([{ type: "full", item: songProps(LONG_SONG) }])).toBe(
      1,
    );
  });

  it("renders heading + full + cols bands as exactly THREE stack children", () => {
    expect(
      stackChildren([
        { type: "heading", label: "COMMUNION" },
        { type: "full", item: songProps(LONG_SONG) },
        { type: "cols", left: [songProps(SHORT_SONG)], right: [] },
      ]),
    ).toBe(3);
  });
});

describe("song components render a single root element", () => {
  // Single root = the component lays out identically in the measurement div
  // (block context) and inside any flex parent (band stack / column), so
  // measured height === rendered height.
  it.each([
    [
      "SongSheetBody single-col",
      () => <SongSheetBody {...songProps(SHORT_SONG)} />,
    ],
    ["SongSheetBody 2-col", () => <SongSheetBody {...songProps(LONG_SONG)} />],
    [
      "SingleSongForColumn",
      () => <SingleSongForColumn {...songProps(SHORT_SONG)} />,
    ],
    ["SegmentHeading", () => <SegmentHeading label='COMMUNION' />],
  ])("%s", (_name, makeElement) => {
    const markup = renderToStaticMarkup(<div>{makeElement()}</div>);
    expect(childCountAtDepth(markup, 1)).toBe(1);
  });
});
