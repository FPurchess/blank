import coverage from "./coverage";

// pdfmake has no font fallback, so characters the main font lacks (e.g. the
// ⇒ arrows from autocompletion, or non-Latin scripts) are set in DejaVu Sans,
// just like the browser does in the editor
export const FALLBACK_FONT = "DejaVu Sans";

export const isCovered = (codePoint: number): boolean => {
  let low = 0;
  let high = coverage.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const [first, last] = coverage[mid];
    if (codePoint < first) high = mid - 1;
    else if (codePoint > last) low = mid + 1;
    else return true;
  }
  return false;
};

type Run = { text: string; font?: string };

/**
 * withFallback returns `text` unchanged when the main font covers all of it,
 * and otherwise splits it into runs, giving uncovered runs the fallback font.
 * pdfmake doesn't pass italics or bold on to nested runs, so `marks` are
 * copied onto every run.
 */
export const withFallback = <Marks extends object>(
  text: string,
  marks = {} as Marks,
): string | (Run & Marks)[] => {
  const runs: (Run & Marks)[] = [];
  for (const char of text) {
    const font = isCovered(char.codePointAt(0)!) ? undefined : FALLBACK_FONT;
    const last = runs[runs.length - 1];
    if (last && last.font === font) last.text += char;
    else runs.push({ ...marks, text: char, ...(font && { font }) });
  }
  return runs.length > 1 || runs[0]?.font ? runs : text;
};
