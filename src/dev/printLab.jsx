/* eslint-disable react-refresh/only-export-components -- dev harness, not app code */
// Diagnostic harness for PDF export packing (open /print-lab.html in dev).
// Runs the REAL export pipeline — measureSetlistItems → packPages → PrintPage —
// on a stress setlist and reports measured vs actually-rendered heights plus
// horizontal chord-line overflow (window.__printLabReport; `ok` must be true).
// Kept on purpose: run it before touching print components or packing
// constants — see "PDF export invariants" in CLAUDE.md.
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import "../index.css";
import { parseRawContent } from "../lib/ingestion";
import { packPages } from "../lib/pdfPacking";
import { measureSetlistItems } from "../lib/printMeasure";
import { numberSlots } from "../lib/setlistSegments";
import { PrintPage } from "../components/song/SongRenderer";
import {
  PRINT_PAGE_HEIGHT,
  PRINT_SONG_GAP,
} from "../lib/printMetrics";

const A4_HEIGHT = 1122.52;

const GOODNESS_OF_GOD = `[Intro]
G  Gsus4 G  Gsus4

[Verse 1]
    G
I love you, Lord
      C     G
For your mercy never fails me
D/F# Em    C      D
All my days, I've been held in your hands
       Em  C
From the moment that I wake up
    G  D/F# Em
Until I lay my head
   C   D    G
I will sing of the goodness of God

[Chorus]
C          G
All my life you have been faithful
C        G  D
All my life you have been so, so good
C          G D/F# Em
With every breath that I am able
   C   D    G
I will sing of the goodness of God

[Verse 2]
    G
I love your voice
     C      G
You have led me through the fire
 D/F# Em    C      D
In darkest night you are close like no other
     Em  C
I've known you as a father
     G D/F# Em
I've known you as a friend
   C   D   G
I have lived in the goodness of God

[Bridge]
G/B       C
Your goodness is running after,
  D    G
It's running after me
G/B       C
Your goodness is running after,
  D    G
It's running after me
  G/B         C
With my life laid down, I'm surrendered now
 D     Em
I give you everything
G/B       C
Your goodness is running after,
  D    G
It keeps running after me`;

const MATCHLESS_LOVE = `[Intro]
G#m F#/Bb B C#m

[Verse 1]
     G#m    F#/Bb   B
You went to Calvary and gave your very best
C#m      G#m  F#/Bb  F#sus F#
You died and rose again, all for me
     G#m  F#/Bb B
You said it is finished ohhhhhhh
C#m       F#
Now I sing, now I sing

[Verse 2]
     G#m    F#/Bb   B
You went to Calvary and gave Your very best
C#m      G#m  F#/Bb  F#sus F#
You died and rose again, all for me
     G#m  F#/Bb B
You said it is finished ohhhhhhh
C#m       F#
Now I sing, now I sing

[Chorus]
   E    B
Oh what a matchless love display
   E    F#
Oh what a glorious sacrifice
   E    B
I am grateful for Your body
F#      G#m
Grateful for the blood
E  B  F#
Jesus I love You`;

// Short filler songs to build a fuller page (sub-pixel accumulation stress).
const FILLER = (n) => `[Verse]
G       C
Filler song ${n} lyric line one here
D       Em
Second lyric line of filler ${n}
G       C
Third lyric line of filler ${n}
D       G
Fourth lyric line for filler ${n}

[Chorus]
C       G
Chorus line one of filler ${n}
D       Em
Chorus line two of filler ${n}
C     D     G
Chorus line three of filler ${n}`;

// Stress songs for the failure modes the measure pass must handle.
const sectionsOf = (n, chord, lyric) =>
  Array.from(
    { length: n },
    (_, i) => `[Verse ${i + 1}]\n` + `${chord}\n${lyric}\n`.repeat(4),
  ).join("\n");
const LONG_LYRIC =
  "And I will sing of your goodness all my life, forever and ever amen";
// 54 lines whose lyrics wrap at half width: estimated split overflowed A4.
const LONG_WRAPPING = sectionsOf(6, "G        C        D        Em", LONG_LYRIC);
// Short, but one 45-char chord line is ~410px bold — wider than a 357px column.
const DENSE_CHORDS = `[Verse]
Bbmaj7 Bbmaj7 Bbmaj7 Bbmaj7 Bbmaj7 Bbmaj7 Bbm
Short lyric line
G       C
Another short line`;
// Far taller than one page even in two columns: must shrink to fit.
const HUGE = sectionsOf(14, "G        C        D        Em", LONG_LYRIC);
// Long song whose chord lines are too wide for a half column.
const WIDE_CHORDS_LONG = sectionsOf(
  6,
  "Gmaj7    Cadd9/E    D/F#    Em7    Bbmaj7#11    Asus4    G",
  "I love you Lord",
);

function makeSlot(id, title, key, raw) {
  return {
    id,
    song_id: id,
    chosen_key: key,
    capo: 0,
    song: { id, title, artist: id === "ml" ? "Sinach" : "", original_key: key, parsed_content: parseRawContent(raw) },
  };
}

const slots = [
  makeSlot("f1", "Filler One", "G", FILLER(1)),
  makeSlot("f2", "Filler Two", "C", FILLER(2)),
  makeSlot("f3", "Filler Three", "D", FILLER(3)),
  makeSlot("gog", "Goodness Of God", "G", GOODNESS_OF_GOD),
  { id: "div1", song_id: null, label: "COMMUNION", page_break: false },
  makeSlot("ml", "Matchless Love", "B", MATCHLESS_LOVE),
  makeSlot("lw", "Long Wrapping", "G", LONG_WRAPPING),
  { id: "div2", song_id: null, label: "RESPONSE", page_break: false },
  makeSlot("dc", "Dense Chords", "Bb", DENSE_CHORDS),
  makeSlot("hg", "Huge Song", "G", HUGE),
  { id: "div3", song_id: null, label: "CLOSING", page_break: true },
  makeSlot("wc", "Wide Chords Long", "G", WIDE_CHORDS_LONG),
];

// Height the packer believes a band occupies (must equal the rendered height).
function expectedBandHeight(band, nextHeadingH) {
  if (band.type === "heading") return nextHeadingH();
  if (band.type === "full") return band.item.height;
  const col = (items) =>
    items.reduce((h, it, i) => h + it.height + (i > 0 ? PRINT_SONG_GAP : 0), 0);
  return Math.max(col(band.left), col(band.right));
}

function run() {
  const entries = numberSlots(slots).map((entry) => {
    if (entry.kind === "divider")
      return { kind: "divider", label: entry.label, pageBreak: entry.pageBreak };
    const slot = entry.slot;
    return {
      kind: "song",
      props: {
        song: slot.song,
        semitones: 0,
        targetKey: slot.chosen_key,
        keyLabel: slot.chosen_key,
        songNumber: entry.songNumber,
      },
    };
  });

  const items = measureSetlistItems(entries);
  const pages = packPages(items);
  // Heading bands carry only a label; they appear in the same order as the
  // divider items, so consume divider heights in order.
  const headingHs = items.filter((it) => it.isDivider).map((it) => it.height);
  const nextHeadingH = () => headingHs.shift();

  // ── render pass: same containers as createPrintContainer, but visible ──
  const out = document.getElementById("pages");
  const range = document.createRange();
  const pageReports = pages.map((page, pi) => {
    const container = document.createElement("div");
    container.style.cssText =
      "width:794px;background:white;color:black;padding:0;font-family:Arial,sans-serif;font-size:14px;outline:3px solid red;margin:20px 0;position:relative;";
    out.appendChild(container);
    const root = createRoot(container);
    flushSync(() => root.render(<PrintPage bands={page.bands} />));

    const stack = container.firstElementChild.firstElementChild;
    const renderedStackH = stack.getBoundingClientRect().height;
    const expectedStackH = page.bands.reduce(
      (h, band, i) =>
        h + expectedBandHeight(band, nextHeadingH) + (i > 0 ? PRINT_SONG_GAP : 0),
      0,
    );
    // Chord lines never wrap: their glyphs must stay inside their column.
    const chordOverflows = [...container.querySelectorAll('[data-print-line="chord_line"]')].filter(
      (el) => {
        range.selectNodeContents(el);
        return range.getBoundingClientRect().width > el.clientWidth + 0.5;
      },
    ).length;

    // A4 pdf page height line
    const marker = document.createElement("div");
    marker.style.cssText = `position:absolute;top:${A4_HEIGHT}px;left:0;right:0;border-top:2px dashed red;z-index:10;`;
    container.appendChild(marker);

    const containerH = container.getBoundingClientRect().height;
    const report = {
      page: pi + 1,
      containerH: Math.round(containerH * 100) / 100,
      overA4: Math.round((containerH - A4_HEIGHT) * 100) / 100,
      expectedStackH,
      renderedStackH: Math.round(renderedStackH * 100) / 100,
      chordOverflows,
    };
    report.ok =
      report.overA4 <= 0 &&
      renderedStackH <= expectedStackH + 1 &&
      chordOverflows === 0;
    return report;
  });

  const summary = {
    ok: pageReports.every((p) => p.ok),
    items: items.map((it) => ({
      item: it.isDivider ? `divider:${it.label}` : it.song.title,
      fitsHalf: !!it.fitsHalf,
      measuredH: it.height,
      scale: it.scale,
      splitAt: it.splitAt,
    })),
    pages: pageReports,
    pageBudget: PRINT_PAGE_HEIGHT,
  };
  document.getElementById("report").textContent = JSON.stringify(summary, null, 2);
  window.__printLabReport = summary;
}

const mount = document.createElement("div");
mount.innerHTML = `<pre id="report" style="font-size:11px;background:#111;color:#0f0;padding:8px;"></pre><div id="pages"></div>`;
document.body.appendChild(mount);
run();
