/* eslint-disable react-refresh/only-export-components -- dev harness, not app code */
// Diagnostic harness for PDF export packing (open /print-lab.html in dev).
// Replicates SetlistView.handleExportPDF measure→pack→render pipeline and
// reports measured vs actually-rendered heights (window.__printLabReport).
// Kept on purpose: run it before touching print components or packing
// constants — see "PDF export invariants" in CLAUDE.md.
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import "../index.css";
import { parseRawContent } from "../lib/ingestion";
import { packPages } from "../lib/pdfPacking";
import { numberSlots } from "../lib/setlistSegments";
import {
  SegmentHeading,
  SingleSongForColumn,
  SongSheetBody,
  PrintPage,
  PRINT_TWO_COL_LINE_THRESHOLD,
} from "../components/song/SongRenderer";

const PAGE_HEIGHT = 1086;
const SONG_GAP = 16;
const HALF_COL_WIDTH = 357;
const FULL_WIDTH = 746;
const MAX_HALF_COL_CHARS = 45;

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

function getMaxLineChars(parsedContent) {
  let max = 0;
  for (const line of parsedContent || []) {
    let len = 0;
    if (line.type === "chord_line") {
      len = line.tokens
        ? line.tokens.reduce((s, t) => s + (t.leadingSpaces || 0) + t.text.length, 0)
        : (line.raw || "").length;
    } else if (line.type === "lyric_line") {
      len = (line.text || "").length;
    }
    if (len > max) max = len;
  }
  return max;
}
const countNonBlankLines = (pc) => (pc || []).filter((l) => l.type !== "blank").length;

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
];

function run() {
  const report = [];
  const rawEntries = numberSlots(slots).map((entry) => {
    if (entry.kind === "divider")
      return { kind: "divider", label: entry.label, pageBreak: entry.pageBreak };
    const slot = entry.slot;
    const content = slot.song.parsed_content;
    return {
      kind: "song",
      maxChars: getMaxLineChars(content),
      nonBlankLines: countNonBlankLines(content),
      props: {
        song: slot.song,
        semitones: 0,
        targetKey: slot.chosen_key,
        keyLabel: slot.chosen_key,
        songNumber: entry.songNumber,
      },
    };
  });

  // ── measurement pass: identical to SetlistView.handleExportPDF ──
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

  const items = rawEntries.map((d, id) => {
    if (d.kind === "divider") {
      const height = measure(FULL_WIDTH, <SegmentHeading label={d.label} />);
      return { id, isDivider: true, label: d.label, pageBreak: d.pageBreak, height };
    }
    const narrowCandidate =
      d.maxChars <= MAX_HALF_COL_CHARS &&
      d.nonBlankLines <= PRINT_TWO_COL_LINE_THRESHOLD;
    let fitsHalf, height;
    if (narrowCandidate) {
      const h = measure(HALF_COL_WIDTH, <SingleSongForColumn {...d.props} />);
      if (h <= PAGE_HEIGHT) {
        fitsHalf = true;
        height = h;
      } else {
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

  items.forEach((it) => {
    report.push({
      item: it.isDivider ? `divider:${it.label}` : it.song.title,
      fitsHalf: !!it.fitsHalf,
      measuredH: it.height,
    });
  });

  const pages = packPages(items, { pageHeight: PAGE_HEIGHT, gap: SONG_GAP });

  // ── render pass: same containers as createPrintContainer, but visible ──
  const out = document.getElementById("pages");
  const pageReports = [];
  pages.forEach((page, pi) => {
    const container = document.createElement("div");
    container.style.cssText =
      "width:794px;background:white;color:black;padding:0;font-family:Arial,sans-serif;font-size:14px;outline:3px solid red;margin:20px 0;position:relative;";
    out.appendChild(container);
    const root = createRoot(container);
    flushSync(() => root.render(<PrintPage bands={page.bands} />));

    // A4 pdf page height line
    const marker = document.createElement("div");
    marker.style.cssText =
      "position:absolute;top:1122.52px;left:0;right:0;border-top:2px dashed red;z-index:10;";
    container.appendChild(marker);

    const rect = container.getBoundingClientRect();
    const bands = [...container.querySelectorAll(":scope > div > div")].map((b) => {
      const r = b.getBoundingClientRect();
      return Math.round(r.height * 100) / 100;
    });
    pageReports.push({
      page: pi + 1,
      containerH: Math.round(rect.height * 100) / 100,
      overA4: Math.round((rect.height - 1122.52) * 100) / 100,
      bandHeights: bands,
    });
  });

  const summary = { items: report, pages: pageReports, PAGE_HEIGHT, wrapperMax: PAGE_HEIGHT + 36 };
  document.getElementById("report").textContent = JSON.stringify(summary, null, 2);
  window.__printLabReport = summary;
}

const mount = document.createElement("div");
mount.innerHTML = `<pre id="report" style="font-size:11px;background:#111;color:#0f0;padding:8px;"></pre><div id="pages"></div>`;
document.body.appendChild(mount);
run();
