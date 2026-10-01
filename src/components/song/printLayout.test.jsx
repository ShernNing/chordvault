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
import { PRINT_SONG_GAP } from "../../lib/printMetrics";
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

describe("between-song gap uses PRINT_SONG_GAP everywhere", () => {
  // packPages callers pass PRINT_SONG_GAP as `gap`; the rendered band stack
  // and the columns inside a cols band must use the exact same value or the
  // packer's height math diverges from the render (→ sliced songs).
  it("PrintPage band stack and ColsBand columns render gap:PRINT_SONG_GAP", () => {
    const markup = renderToStaticMarkup(
      <PrintPage
        bands={[
          {
            type: "cols",
            left: [songProps(SHORT_SONG)],
            right: [songProps(SHORT_SONG)],
          },
          { type: "full", item: songProps(SHORT_SONG) },
        ]}
      />,
    );
    const gaps = [...markup.matchAll(/gap:(\d+)px/g)].map((m) => Number(m[1]));
    // band stack + two column stacks use the song gap; the 32px horizontal
    // column gutter is the only other gap allowed.
    expect(gaps.filter((g) => g === PRINT_SONG_GAP)).toHaveLength(3);
    expect(gaps.every((g) => g === PRINT_SONG_GAP || g === 32)).toBe(true);
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
      "SongSheetBody measured split + scale",
      () => <SongSheetBody {...songProps(LONG_SONG)} splitAt={10} scale={0.8} />,
    ],
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

describe("measure-pass layout props (splitAt, scale)", () => {
  const COL_OPEN = '<div style="flex:1;min-width:0">';
  const sectionsIn = (html) => html.split("data-print-section").length - 1;

  it("splitAt=k puts exactly the first k sections in the left column", () => {
    const markup = renderToStaticMarkup(
      <SongSheetBody {...songProps(LONG_SONG)} splitAt={10} />,
    );
    const [, left, right] = markup.split(COL_OPEN);
    expect(sectionsIn(left)).toBe(10);
    expect(sectionsIn(right)).toBe(15);
    expect(left).toContain("Lyric line 9");
    expect(left).not.toContain("Lyric line 10");
  });

  it("splitAt=0 forces a single column even for a long song", () => {
    const markup = renderToStaticMarkup(
      <SongSheetBody {...songProps(LONG_SONG)} splitAt={0} />,
    );
    expect(markup).not.toContain("display:flex");
    expect(sectionsIn(markup)).toBe(25);
  });

  it("scale shrinks every font size and vertical spacer proportionally", () => {
    const markup = renderToStaticMarkup(
      <SongSheetBody {...songProps(SHORT_SONG)} scale={0.5} />,
    );
    const sizes = [...markup.matchAll(/font-size:([\d.]+)px/g)].map((m) =>
      Number(m[1]),
    );
    expect(new Set(sizes)).toEqual(new Set([9.5, 8])); // title 19, lines 16
    expect(markup).toContain("height:4px"); // blank spacer 8px
    expect(markup).toContain("margin-bottom:4px"); // title margin 8px
  });

  it("tags every printed line with its type for width measurement", () => {
    const markup = renderToStaticMarkup(
      <SingleSongForColumn {...songProps(SHORT_SONG)} />,
    );
    expect(markup.split('data-print-line="chord_line"').length - 1).toBe(4);
    expect(markup.split('data-print-line="lyric_line"').length - 1).toBe(4);
    expect(markup.split('data-print-line="section_header"').length - 1).toBe(2);
  });
});
