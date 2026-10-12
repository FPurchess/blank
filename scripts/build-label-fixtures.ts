// Writes the pages the found places' test reads (src/signing/__fixtures__/
// labels/), each with the places it has:
//
// - form-pdf.json: src-tauri/pdf/fixtures/form.pdf's words where
//   `pdftotext -bbox` finds them, and its rule, which pdftotext doesn't give;
// - the others: hand-made forms and traps, their words laid out with
//   Helvetica's widths, roughly.
//
// Every word's box is as the helper's `text` op gives it: from 0.8 em above
// the baseline to 0.25 em below (pdftotext's, 0.718 and 0.207 em of
// Helvetica, are made into those).
//
// The places expected are where src/signing/labels.ts puts them (see
// .claude/rules/pdf.md, "Places and fills"): on a line a label stands left
// of, 1.6 label heights tall; 36 pt (a signature or initials) or 18 pt above
// a line a caption stands under; between a label and the line below it.
//
// Run with `bun scripts/build-label-fixtures.ts` (needs poppler-utils) and
// commit the result.
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

type Rect = [number, number, number, number];
interface Page {
  words: { text: string; rect: Rect }[];
  rules: Rect[];
}

const root = join(import.meta.dir, "..");
const out = join(root, "src", "signing", "__fixtures__", "labels");
mkdirSync(out, { recursive: true });

const round = (n: number) => Math.round(n * 100) / 100;
// how far a word's box reaches above and below its baseline, in em, as the
// helper gives it, and as pdftotext does
const ASCENT = 0.8;
const DESCENT = 0.25;
const PDFTOTEXT_ASCENT = 0.718;
const PDFTOTEXT_DESCENT = 0.207;
// the box of a word `width` wide at `x`, `size` large on `baseline`
const box = (
  x: number,
  baseline: number,
  width: number,
  size: number,
): Rect => [
  round(x),
  round(baseline - ASCENT * size),
  round(width),
  round((ASCENT + DESCENT) * size),
];
const bottom = (rect: Rect) => rect[1] + rect[3];
const em = (c: string) =>
  c === "_"
    ? 0.556
    : " .,:".includes(c)
      ? 0.278
      : "()".includes(c)
        ? 0.333
        : 0.52;

const write = (
  name: string,
  about: string,
  text: Page,
  expected: { kind: string; rect: Rect }[],
) =>
  writeFileSync(
    join(out, `${name}.json`),
    JSON.stringify({ about, text, expected }, null, 2) + "\n",
  );

// form.pdf, as pdftotext reads it
{
  const { stdout } = spawnSync("pdftotext", [
    "-bbox",
    join(root, "src-tauri", "pdf", "fixtures", "form.pdf"),
    "-",
  ]);
  const words = [
    ...stdout
      .toString()
      .matchAll(
        /xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)</gu,
      ),
  ].map(([, x0, y0, x1, y1, text]) => {
    const size = (+y1 - +y0) / (PDFTOTEXT_ASCENT + PDFTOTEXT_DESCENT);
    return {
      text,
      rect: box(+x0, +y0 + PDFTOTEXT_ASCENT * size, +x1 - +x0, size),
    };
  });
  const run = words.find((word) => word.text.startsWith("___"))!.rect;
  const label = 1.6 * run[3];
  write(
    "form-pdf",
    "src-tauri/pdf/fixtures/form.pdf: its words where pdftotext -bbox finds them, in boxes as the helper gives them, and its rule (0.5 w 100 490 m 300 490 l S) drawn by hand",
    // 842 − 490, half the stroke's width up
    { words, rules: [[100, 351.75, 200, 0.5]] },
    [
      { kind: "signature", rect: [100, 315.75, 200, 36] },
      {
        kind: "placeAndDate",
        rect: [run[0], round(bottom(run) - label), run[2], round(label)],
      },
    ],
  );
}

let page: Page;
// writes `string` from x on `baseline`, returning its words' rects
const text = (x: number, baseline: number, string: string, size = 10) =>
  string.split(" ").flatMap((word) => {
    const width = [...word].reduce((sum, c) => sum + em(c), 0) * size;
    const rect = box(x, baseline, width, size);
    x += width + 0.278 * size;
    if (!word) return [];
    page.words.push({ text: word, rect });
    return [rect];
  });
// draws a rule of half a point at y
const rule = (x: number, y: number, width: number): Rect => {
  const rect: Rect = [x, y - 0.25, width, 0.5];
  page.rules.push(rect);
  return rect;
};
// a run of characters is a line at its word's bottom
const run = (word: Rect): Rect => [word[0], bottom(word) - 1, word[2], 1];
// the part of a word from its character `from` of `chars`
const part = (word: Rect, chars: number, from: number): Rect => [
  word[0] + (word[2] * from) / chars,
  word[1],
  (word[2] * (chars - from)) / chars,
  word[3],
];
const onLine = (line: Rect, label: Rect): Rect => {
  const height = 1.6 * label[3];
  return [
    round(line[0]),
    round(bottom(line) - height),
    round(line[2]),
    round(height),
  ];
};
const above = (line: Rect, height: number): Rect => [
  round(line[0]),
  round(line[1] - height),
  round(line[2]),
  height,
];
const between = (label: Rect, line: Rect): Rect => [
  round(line[0]),
  round(bottom(label)),
  round(line[2]),
  round(line[1] - bottom(label)),
];
// the baseline of 9 pt words just below a rule at y
const under = (y: number) => y + 10.4;
// writes the page `build` makes
const fixture = (
  name: string,
  about: string,
  build: () => { kind: string; rect: Rect }[],
) => {
  page = { words: [], rules: [] };
  const expected = build();
  write(name, about, page, expected);
};

fixture(
  "en-colon-underscores",
  "English labels with a colon, left of underscores, in single-spaced lines; Name gets no place",
  () => {
    text(72, 100, "Application for a parking permit", 14);
    text(72, 600, "Name: ____________________");
    const signature = text(72, 612, "Signature: ____________________");
    const date = text(72, 624, "Date: ____________");
    return [
      { kind: "signature", rect: onLine(run(signature[1]), signature[0]) },
      { kind: "date", rect: onLine(run(date[1]), date[0]) },
    ];
  },
);

fixture(
  "de-captions-under-rules",
  "German captions just below drawn rules: Ort, Datum and Unterschrift",
  () => {
    text(
      72,
      600,
      "Berlin, den 1. Oktober 2026. Beide Seiten erhalten eine Ausfertigung.",
    );
    const a = rule(72, 700, 180);
    const b = rule(320, 700, 200);
    text(72, 710.43, "Ort, Datum");
    text(320, 710.43, "Unterschrift");
    return [
      { kind: "placeAndDate", rect: above(a, 18) },
      { kind: "signature", rect: above(b, 36) },
    ];
  },
);

fixture(
  "en-parens-under-underscores",
  "English captions in brackets below runs of underscores",
  () => {
    const [a] = text(72, 650, "________________________________");
    const [b] = text(330, 650, "______________________");
    text(120, 662, "(signature)", 8);
    text(380, 662, "(date)", 8);
    return [
      { kind: "signature", rect: above(run(a), 36) },
      { kind: "date", rect: above(run(b), 18) },
    ];
  },
);

fixture(
  "en-prose-traps",
  "Labels in running text, a heading under a separator rule: no places",
  () => {
    text(72, 100, "Notes on the agreement", 14);
    text(
      72,
      130,
      "The parties agree that the start date of this contract is the date it is",
    );
    text(
      72,
      142,
      "signed by both of them. Signed copies are kept by both parties, and the",
    );
    text(
      72,
      154,
      "signature of a witness is not needed. The place of signing doesn't matter.",
    );
    rule(72, 170, 450);
    text(72, 182.25, "Place of performance", 12);
    text(
      72,
      200,
      "Date and place are given in the header. Sign here only if you agree.",
    );
    text(
      72,
      230,
      "Initials: see the appendix for the initials of every clerk.",
    );
    rule(72, 260, 450);
    text(72, 270.4, "Payment is due upon signature of the agreement.", 9);
    return [];
  },
);

fixture(
  "de-prose-traps",
  "German running text about signatures, under and over drawn rules: no places",
  () => {
    text(72, 100, "§ 12 Schlussbestimmungen", 14);
    rule(72, 120, 450);
    text(72, 130.4, "Die Unterschrift des Mieters ist erforderlich.", 9);
    text(
      72,
      160,
      "Mit der Unterschrift erkennt der Mieter die Hausordnung an. Ort und",
    );
    text(
      72,
      172,
      "Datum der Übergabe stehen im Protokoll. Unterschriften Dritter sind",
    );
    text(72, 184, "nicht nötig; ein Stempel und eine Unterschrift genügen.");
    rule(72, 230, 450);
    return [];
  },
);

fixture(
  "en-table-trap",
  "A table whose header says Date, between drawn borders: no places",
  () => {
    text(72, 270, "Payments received so far:");
    rule(72, 300, 400);
    text(76, 312, "Date");
    text(276, 312, "Amount");
    rule(72, 318, 400);
    text(76, 330, "2026-01-05");
    text(276, 330, "100 EUR");
    rule(72, 336, 400);
    text(76, 348, "Datum");
    rule(72, 354, 200);
    return [];
  },
);

fixture(
  "de-dots-one-line",
  "German labels left of dot runs, both on one line",
  () => {
    const w = text(
      72,
      720,
      "Ort, Datum ......................................   Unterschrift ..........................................",
    );
    return [
      { kind: "placeAndDate", rect: onLine(run(w[2]), w[1]) },
      { kind: "signature", rect: onLine(run(w[4]), w[3]) },
    ];
  },
);

fixture(
  "glued-labels",
  "Labels written into the same word as their underscores",
  () => {
    const [s] = text(72, 500, "Signature:______________________________");
    const [d] = text(72, 540, "Datum:____________________");
    return [
      { kind: "signature", rect: onLine(run(part(s, 40, 10)), s) },
      { kind: "date", rect: onLine(run(part(d, 26, 6)), d) },
    ];
  },
);

fixture(
  "initials",
  "Initials at the foot of a page, in English, German and French-style German",
  () => {
    const a = text(420, 800, "Initials: __________");
    const b = text(72, 800, "Kürzel ________");
    const c = text(230, 800, "Paraphe: _________");
    return [a, b, c].map((w) => ({
      kind: "initials",
      rect: onLine(run(w[1]), w[0]),
    }));
  },
);

fixture(
  "labels-above-lines",
  "Labels above drawn rules, and Sign here left of underscores",
  () => {
    const [s] = text(72, 500, "Signature");
    const a = rule(72, 540, 200);
    const [d] = text(320, 500, "Datum");
    const b = rule(320, 525, 150);
    const h = text(72, 600, "Sign here: ____________________");
    return [
      { kind: "signature", rect: between(s, a) },
      { kind: "date", rect: between(d, b) },
      { kind: "signature", rect: onLine(run(h[2]), h[1]) },
    ];
  },
);

fixture("whose-signature", "Signature labels that say whose they are", () => {
  const a = rule(72, 650, 200);
  const b = rule(320, 650, 200);
  text(72, under(650), "Unterschrift des Vermieters", 9);
  text(320, under(650), "Signature of the tenant", 9);
  const c = text(72, 720, "Signed by: ______________________");
  return [
    { kind: "signature", rect: above(a, 36) },
    { kind: "signature", rect: above(b, 36) },
    { kind: "signature", rect: onLine(run(c[2]), c[0]) },
  ];
});

fixture(
  "de-roles",
  "German signature captions with the signer's role before or after them",
  () => {
    const rules = [72, 260, 440].map((x) => rule(x, 650, 160));
    text(72, under(650), "Unterschrift Mieter", 9);
    text(260, under(650), "Unterschrift Vermieter/in", 9);
    text(440, under(650), "Mieter/in (Unterschrift)", 9);
    const d = rule(72, 720, 220);
    text(72, under(720), "Erziehungsberechtigte(r) (Unterschrift)", 9);
    const e = text(72, 770, "Unterschrift Arbeitgeber: ____________________");
    const f = text(320, 770, "Arbeitnehmer (Unterschrift) _______________");
    const g = rule(72, 810, 200);
    text(72, under(810), "Unterschriften Auftraggeber, Auftragnehmer", 9);
    return [
      ...rules.map((line) => ({ kind: "signature", rect: above(line, 36) })),
      { kind: "signature", rect: above(d, 36) },
      { kind: "signature", rect: onLine(run(e[2]), e[1]) },
      { kind: "signature", rect: onLine(run(f[2]), f[1]) },
      { kind: "signature", rect: above(g, 36) },
    ];
  },
);

fixture(
  "en-roles",
  "English signature captions that name the signer's role",
  () => {
    const a = rule(72, 650, 200);
    const b = rule(320, 650, 200);
    text(72, under(650), "Signature of Tenant", 9);
    text(320, under(650), "Tenant's signature", 9);
    const c = text(72, 720, "Landlord signature: ______________________");
    return [
      { kind: "signature", rect: above(a, 36) },
      { kind: "signature", rect: above(b, 36) },
      { kind: "signature", rect: onLine(run(c[2]), c[1]) },
    ];
  },
);

fixture(
  "stamps-and-dates",
  "Signature captions that ask for a stamp too, and the date of signing",
  () => {
    const stamps = [72, 210, 340, 470].map((x) => rule(x, 600, 110));
    text(72, under(600), "Signatur/Stempel", 9);
    text(210, under(600), "Unterschrift/Stempel", 9);
    text(340, under(600), "Unterschrift und Stempel", 9);
    text(470, under(600), "Stempel und Unterschrift", 9);
    const dates = [72, 260].map((x) => rule(x, 680, 160));
    text(72, under(680), "Datum der Unterschrift", 9);
    text(260, under(680), "Date of signature", 9);
    const c = text(72, 740, "Date signed: ______________");
    const d = text(320, 740, "Ort und Datum: ____________________");
    return [
      ...stamps.map((line) => ({ kind: "signature", rect: above(line, 36) })),
      ...dates.map((line) => ({ kind: "date", rect: above(line, 18) })),
      { kind: "date", rect: onLine(run(c[2]), c[1]) },
      { kind: "placeAndDate", rect: onLine(run(d[3]), d[2]) },
    ];
  },
);
