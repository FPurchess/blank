import type { PageText, Rect } from "../pdf/fields";

// Found places: where a PDF without a form asks for a signature, a date or a
// place, read from the words and lines of its pages. A label ("Unterschrift",
// "Ort, Datum:", "(signature)") counts only next to a line to write on (a run
// of underscores or dots, or a drawn rule), so a word in running text finds
// nothing: a place that isn't there is worse than one the user adds.

export type PlaceKind =
  "signature" | "date" | "place" | "placeAndDate" | "initials";

// a place found on the page `page` (from 0): what goes there, where, and the
// label it was found by, as the page writes it
export interface FoundPlace {
  page: number;
  kind: PlaceKind;
  rect: Rect;
  label: string;
}

// the labels, normalized (see `normalize`)
const LABELS: Record<string, PlaceKind> = {
  signature: "signature",
  unterschrift: "signature",
  signed: "signature",
  "sign here": "signature",
  signatur: "signature",
  date: "date",
  datum: "date",
  place: "place",
  ort: "place",
  "place, date": "placeAndDate",
  "date, place": "placeAndDate",
  "ort, datum": "placeAndDate",
  "datum, ort": "placeAndDate",
  unterschriften: "signature",
  "signatur, stempel": "signature",
  "stempel, signatur": "signature",
  "unterschrift, stempel": "signature",
  "stempel, unterschrift": "signature",
  "unterschrift stempel": "signature",
  "signature, stamp": "signature",
  "stamp, signature": "signature",
  "datum der unterschrift": "date",
  unterschriftsdatum: "date",
  "date of signature": "date",
  "date of signing": "date",
  "date signed": "date",
  "signing date": "date",
  "signature date": "date",
  initials: "initials",
  kürzel: "initials",
  paraphe: "initials",
};

// the words that may follow a signature's label and say whose it is, as in
// "Signature of the tenant" or "Unterschrift des Mieters"
const WHOSE = new Set(["of", "by", "for", "des", "der", "von", "vom", "für"]);

// how far a label may be from its line, in points
const BASELINE = 3;
const LEFT_GAP = 48;
const BELOW = 14;
const ABOVE_MIN = 12;
const ABOVE_MAX = 72;
// how far apart two places may be on every side and still be one
export const NEAR = 4;

const RUN = /_{5,}|\.{8,}|…{3,}/gu;
const LETTER = /[\p{L}\p{N}]/u;

/**
 * normalize returns a label as LABELS has it: in lower case, without its
 * colon, brackets or asterisk, with "/", "&", "und" and "and" between two
 * words written as ", "
 */
const normalize = (text: string) =>
  text
    .normalize("NFC")
    .toLowerCase()
    .replace(/[():*"“”„]/gu, "")
    .replace(/\s+(?:und|and|&)\s+/gu, ", ")
    .replace(/\s*[,/]\s*/gu, ", ")
    .replace(/[\s,.;]+$/u, "")
    .replace(/^[\s,.;]+/u, "")
    .replace(/\s+/gu, " ");

// the words for a signature that a role may stand next to, as in
// "Unterschrift Mieter", "Mieter/in (Unterschrift)" or "Tenant's signature"
const SIGNATURE_WORDS = new Set([
  "signature",
  "unterschrift",
  "unterschriften",
  "signatur",
]);
// a role: a word with a capital, e.g. "Vermieter", "Mieter/in",
// "Erziehungsberechtigte(r)" or "Tenant's"
const ROLE = /^\p{Lu}[\p{L}'’/()-]*[,:]?$/u;
// capitalised words next to a signature's label that aren't whose it is
const NOT_ROLES = new Set([
  "the",
  "a",
  "an",
  "your",
  "my",
  "our",
  "his",
  "her",
  "their",
  "this",
  "please",
  "die",
  "der",
  "das",
  "ihre",
  "ihr",
  "eine",
  "ein",
  "seine",
  "meine",
  "unsere",
  "bitte",
  "name",
  "vorname",
  "nachname",
  "stempel",
  "stamp",
  "seite",
  "page",
]);

/**
 * roleOf returns the role one or two capitalised words name, e.g. "Tenant"
 * for "Tenant's"; none for other words, or a label's
 */
const roleOf = (texts: string[]) => {
  if (!texts.length || texts.length > 2) return undefined;
  const roles = texts.every((text) => {
    const word = normalize(text);
    return (
      ROLE.test(text) &&
      !NOT_ROLES.has(word) &&
      !LABELS[word] &&
      !SIGNATURE_WORDS.has(word)
    );
  });
  return roles
    ? texts
        .join(" ")
        .replace(/[,:]$/u, "")
        .replace(/['’]s$/u, "")
    : undefined;
};

// what a label asks for, and whose signature it is if it names a role
interface Label {
  kind: PlaceKind;
  role?: string;
}

/**
 * labelOf returns what the words `texts` ask for, if they are a label as a
 * whole, a signature's label followed by whose it is in up to three words,
 * or a signature's label with a role before or after it
 */
const labelOf = (texts: string[]): Label | undefined => {
  const whole = LABELS[normalize(texts.join(" "))];
  if (whole) return { kind: whole };
  for (const length of [2, 1]) {
    if (texts.length <= length || texts.length > length + 3) continue;
    const kind = LABELS[normalize(texts.slice(0, length).join(" "))];
    if (
      (kind === "signature" || kind === "initials") &&
      WHOSE.has(normalize(texts[length]))
    )
      return { kind };
  }
  const role =
    (SIGNATURE_WORDS.has(normalize(texts[0])) && roleOf(texts.slice(1))) ||
    (SIGNATURE_WORDS.has(normalize(texts[texts.length - 1])) &&
      roleOf(texts.slice(0, -1)));
  return role ? { kind: "signature", role } : undefined;
};

// a word of the page, or the part of one that is text or a line
interface Token {
  text: string;
  rect: Rect;
  line: boolean;
}

const right = (rect: Rect) => rect[0] + rect[2];
const bottom = (rect: Rect) => rect[1] + rect[3];
const centre = (rect: Rect) => rect[0] + rect[2] / 2;

/**
 * tokensOf splits the words at their runs of underscores or dots, e.g.
 * "Datum:__________" into "Datum:" and a line, sharing the word's width out
 * by characters
 */
const tokensOf = (words: PageText["words"]): Token[] =>
  words.flatMap(({ text, rect }) => {
    const chars = [...text];
    const at = (index: number) =>
      rect[0] + (rect[2] * [...text.slice(0, index)].length) / chars.length;
    const tokens: Token[] = [];
    const add = (start: number, end: number, line: boolean) => {
      const part = text.slice(start, end);
      if (!line && !LETTER.test(part)) return;
      const x = at(start);
      tokens.push({
        text: part.trim(),
        rect: [x, rect[1], at(end) - x, rect[3]],
        line,
      });
    };
    let last = 0;
    for (const match of text.matchAll(RUN)) {
      add(last, match.index, false);
      add(match.index, match.index + match[0].length, true);
      last = match.index + match[0].length;
    }
    add(last, text.length, false);
    return tokens;
  });

/**
 * overlap returns the area two rects share
 */
export const overlap = (a: Rect, b: Rect) =>
  Math.max(0, Math.min(right(a), right(b)) - Math.max(a[0], b[0])) *
  Math.max(0, Math.min(bottom(a), bottom(b)) - Math.max(a[1], b[1]));

/**
 * near tells whether two rects are within NEAR points on every side
 */
export const near = (a: Rect, b: Rect) =>
  Math.abs(a[0] - b[0]) <= NEAR &&
  Math.abs(a[1] - b[1]) <= NEAR &&
  Math.abs(right(a) - right(b)) <= NEAR &&
  Math.abs(bottom(a) - bottom(b)) <= NEAR;

/**
 * mergeNear keeps the first of places on the same page within NEAR points of
 * each other, e.g. a run of underscores over a drawn rule
 */
export const mergeNear = <T extends { page: number; rect: Rect }>(
  places: T[],
): T[] =>
  places.reduce<T[]>((kept, place) => {
    if (
      !kept.some(
        (other) => other.page === place.page && near(other.rect, place.rect),
      )
    )
      kept.push(place);
    return kept;
  }, []);

/**
 * findLabels returns the places the page `page` asks to be signed, dated or
 * given a place on, in the order they were found; `text` is what the helper
 * read of the page
 */
export const findLabels = (text: PageText, page: number): FoundPlace[] => {
  const tokens = tokensOf(text.words);
  const words = tokens.filter((token) => !token.line);
  // every line as a thin rect where it is drawn: a run of characters at the
  // bottom of its word
  const lines: Rect[] = [
    ...tokens
      .filter((token) => token.line)
      .map((token): Rect => [
        token.rect[0],
        bottom(token.rect) - 1,
        token.rect[2],
        1,
      ]),
    ...text.rules.filter((rule) => rule[2] >= 40),
  ];
  const usedWords = new Set<Token>();
  const usedLines = new Set<Rect>();
  const found: FoundPlace[] = [];

  const sameLine = (a: Token, b: Token) =>
    Math.abs(bottom(a.rect) - bottom(b.rect)) <= BASELINE;
  // the gap between two words of one phrase
  const spacing = (token: Token) => Math.max(4, token.rect[3] * 0.8);

  // a place must be free to write in: no word of the page covers half of
  // itself there, but the label's and the lines'
  const free = (rect: Rect, label: Token[]) =>
    words.every(
      (word) =>
        label.includes(word) ||
        overlap(word.rect, rect) <= (word.rect[2] * word.rect[3]) / 2,
    );

  const add = (
    { kind, role }: Label,
    rect: Rect,
    line: Rect,
    label: Token[],
  ) => {
    if (!free(rect, label)) return false;
    usedLines.add(line);
    for (const word of label) usedWords.add(word);
    const written = label
      .map((word) => word.text)
      .join(" ")
      .replace(/^\(|\)$|:$/gu, "")
      .trim();
    found.push({
      page,
      kind,
      rect,
      label: role ? `Signature · ${role}` : written,
    });
    return true;
  };

  // a caption: the words of the text line nearest to the line among
  // `candidates` that stand over or under it, if no other word of their text
  // line runs on from them
  const caption = (
    candidates: Token[],
    nearest: (a: Token, b: Token) => number,
  ) => {
    if (!candidates.length) return undefined;
    const first = [...candidates].sort(nearest)[0];
    const label = candidates
      .filter((word) => sameLine(word, first))
      .sort((a, b) => a.rect[0] - b.rect[0]);
    const start = label[0].rect[0];
    const end = right(label[label.length - 1].rect);
    const runsOn = words.some(
      (word) =>
        !label.includes(word) &&
        sameLine(word, first) &&
        ((right(word.rect) <= start &&
          start - right(word.rect) < spacing(word)) ||
          (word.rect[0] >= end && word.rect[0] - end < spacing(word))),
    );
    return runsOn ? undefined : label;
  };

  // a label left of a line on its baseline: the place is on the line
  for (const line of lines) {
    const before = words
      .filter(
        (word) =>
          !usedWords.has(word) &&
          Math.abs(bottom(word.rect) - bottom(line)) <= BASELINE &&
          right(word.rect) <= line[0] + 2,
      )
      .sort((a, b) => right(b.rect) - right(a.rect));
    if (!before.length || line[0] - right(before[0].rect) > LEFT_GAP) continue;
    const phrase = [before[0]];
    for (const word of before.slice(1, 5)) {
      const next = phrase[phrase.length - 1];
      if (next.rect[0] - right(word.rect) > spacing(word)) break;
      phrase.push(word);
    }
    for (let length = phrase.length; length > 0; length--) {
      const label = phrase.slice(0, length).reverse();
      const asked = labelOf(label.map((word) => word.text));
      if (!asked) continue;
      const height = 1.6 * Math.max(...label.map((word) => word.rect[3]));
      add(
        asked,
        [line[0], bottom(line) - height, line[2], height],
        line,
        label,
      );
      break;
    }
  }

  const over = (line: Rect, word: Token) =>
    centre(word.rect) >= line[0] - 2 && centre(word.rect) <= right(line) + 2;

  // a label just below a line: the place is above the line
  for (const line of lines) {
    if (usedLines.has(line)) continue;
    const label = caption(
      words.filter(
        (word) =>
          !usedWords.has(word) &&
          over(line, word) &&
          word.rect[1] >= bottom(line) - 2 &&
          word.rect[1] - bottom(line) <= BELOW,
      ),
      (a, b) => a.rect[1] - b.rect[1],
    );
    const asked = label && labelOf(label.map((word) => word.text));
    if (!label || !asked) continue;
    const image = asked.kind === "signature" || asked.kind === "initials";
    const height = image ? 36 : 18;
    add(asked, [line[0], line[1] - height, line[2], height], line, label);
  }

  // a label above a line: the place is between them
  for (const line of lines) {
    if (usedLines.has(line)) continue;
    const label = caption(
      words.filter(
        (word) =>
          !usedWords.has(word) &&
          over(line, word) &&
          line[1] - bottom(word.rect) >= ABOVE_MIN &&
          line[1] - bottom(word.rect) <= ABOVE_MAX,
      ),
      (a, b) => bottom(b.rect) - bottom(a.rect),
    );
    const asked = label && labelOf(label.map((word) => word.text));
    if (!label || !asked) continue;
    const top = Math.max(...label.map((word) => bottom(word.rect)));
    add(asked, [line[0], top, line[2], line[1] - top], line, label);
  }

  return mergeNear(found);
};
