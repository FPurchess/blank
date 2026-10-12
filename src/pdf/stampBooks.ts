import { basename } from "../paths";
import { announce, stampBooks, type TabStamps } from "../state";
import type { PdfTabDocument } from "./document";
import { releaseStamp } from "./stampEngine";
import type { Fill } from "./ipc";
import {
  bookOf,
  changed,
  changedSheet,
  EMPTY_BOOK,
  onPages,
  redone,
  type Sheet,
  type Stamp,
  type StampBook,
  undone,
} from "./stampModel";
import { stampKey } from "./stamps";

// The stamps of each PDF tab, the fills of its form and the found places
// dismissed, with their one history (`stampBooks`), changed only here:
// placing, moving, removing, filling in, dismissing, undo and redo,
// forgetting a closed tab's, and restoring what storage kept of a tab's.
// The engines of stamps no tab shows any more are freed.

/**
 * stampsOf returns the stamps of the tab `tab`
 */
export const stampsOf = (tab: string): readonly Stamp[] =>
  stampBooks.value.get(tab)?.book.stamps ?? [];

/**
 * fillsOf returns the fills of the form of the tab `tab`
 */
export const fillsOf = (tab: string): readonly Fill[] =>
  stampBooks.value.get(tab)?.book.fills ?? [];

/**
 * dismissedOf returns the found places of the tab `tab` the user dismissed
 */
export const dismissedOf = (tab: string): readonly string[] =>
  stampBooks.value.get(tab)?.book.dismissed ?? [];

/**
 * hasChanges tells whether the tab `tab` has stamps or fills, which signing
 * keeps: what makes it unsaved
 */
export const hasChanges = (tab: string) => {
  const book = stampBooks.value.get(tab)?.book;
  return !!book && (book.stamps.length > 0 || book.fills.length > 0);
};

/**
 * holdsAnything tells whether `book` holds anything to keep: stamps,
 * fills, dismissed places or a history
 */
const holdsAnything = (book: StampBook) =>
  book.stamps.length > 0 ||
  book.fills.length > 0 ||
  book.dismissed.length > 0 ||
  book.past.length > 0 ||
  book.future.length > 0;

/**
 * keysOf returns what tells apart the looks of the stamps of `books`
 */
const keysOf = (books: ReadonlyMap<string, TabStamps>) =>
  new Set(
    [...books.values()].flatMap(({ book }) =>
      // what undo and redo may bring back keeps its engine too
      [book, ...book.past, ...book.future].flatMap((sheet: Sheet) =>
        sheet.stamps.map((stamp) => stampKey(stamp.spec)),
      ),
    ),
  );

/**
 * write makes `next` the stamps of `tab` (none for null), and frees the
 * engines of the looks no stamp has any more
 */
const write = (tab: string, next: TabStamps | null) => {
  const before = stampBooks.value;
  const books = new Map(before);
  if (next && holdsAnything(next.book)) books.set(tab, next);
  else books.delete(tab);
  stampBooks.value = books;
  const kept = keysOf(books);
  const gone = new Map<string, Stamp["spec"]>();
  for (const { book } of before.values())
    for (const sheet of [book, ...book.past, ...book.future])
      for (const stamp of sheet.stamps)
        if (!kept.has(stampKey(stamp.spec)))
          gone.set(stampKey(stamp.spec), stamp.spec);
  for (const spec of gone.values()) void releaseStamp(spec).catch(() => {});
};

/**
 * changeStamps makes `stamps` the stamps of `tab`, as one step of its
 * history, or part of the last one for a nudge right after one of the same
 * stamp
 * @param sha256 the PDF's they're on, if it's known
 */
export const changeStamps = (
  tab: string,
  stamps: readonly Stamp[],
  {
    nudge,
    sha256,
  }: { nudge?: { id: string; at: number }; sha256?: string | null } = {},
) => {
  const now = stampBooks.value.get(tab);
  const book = changed(now?.book ?? EMPTY_BOOK, stamps, nudge);
  if (book === now?.book) return;
  write(tab, { book, sha256: sha256 ?? now?.sha256 ?? null });
};

/**
 * changeSheet makes `part` (the fills, the dismissed places, the stamps)
 * that of `tab`, as one step of its history
 */
export const changeSheet = (
  tab: string,
  part: Partial<Sheet>,
  { sha256 }: { sha256?: string | null } = {},
) => {
  const now = stampBooks.value.get(tab);
  const book = changedSheet(now?.book ?? EMPTY_BOOK, part);
  if (book === now?.book) return;
  write(tab, { book, sha256: sha256 ?? now?.sha256 ?? null });
};

/**
 * clearSheet drops the stamps, fills and dismissed places of `tab` with
 * their history, e.g. once it was signed: nothing is unsaved then
 */
export const clearSheet = (tab: string) => {
  if (stampBooks.value.has(tab)) write(tab, null);
};

/**
 * canUndoStamps tells whether `tab` has a step to undo
 */
export const canUndoStamps = (tab: string | null) =>
  tab !== null && (stampBooks.value.get(tab)?.book.past.length ?? 0) > 0;

/**
 * canRedoStamps tells whether `tab` has a step to redo
 */
export const canRedoStamps = (tab: string | null) =>
  tab !== null && (stampBooks.value.get(tab)?.book.future.length ?? 0) > 0;

/**
 * undoStamps takes the last step of `tab` back
 * @returns whether there was one
 */
export const undoStamps = (tab: string) => {
  const now = stampBooks.value.get(tab);
  if (!now || !now.book.past.length) return false;
  write(tab, { ...now, book: undone(now.book) });
  return true;
};

/**
 * redoStamps does the step of `tab` undone last again
 * @returns whether there was one
 */
export const redoStamps = (tab: string) => {
  const now = stampBooks.value.get(tab);
  if (!now || !now.book.future.length) return false;
  write(tab, { ...now, book: redone(now.book) });
  return true;
};

/**
 * forgetStamps drops the stamps of `tab`, e.g. once it closed
 */
export const forgetStamps = (tab: string) => {
  restored.add(tab);
  if (stampBooks.value.has(tab)) write(tab, null);
};

// what storage kept of a tab's stamps, fills and dismissed places
// (`stamps:<id>`)
export interface StoredStamps {
  sha256: string | null;
  stamps: Stamp[];
  fills: Fill[];
  dismissed: string[];
}

// the tabs whose stamps were restored, or which had none to restore, this
// session
const restored = new Set<string>();

/**
 * restoreStamps brings back the stamps, fills and dismissed places `stored`
 * of `tab` once its PDF `doc` opened, the first time only: as they were on
 * the same file; on a file that changed, without the stamps on pages it no
 * longer has and without the fills and dismissed places, whose fields and
 * lines may be others now, which it says; on a file that went or can't be
 * opened, as they were
 */
export const restoreStamps = (
  tab: string,
  doc: PdfTabDocument,
  stored: StoredStamps | null,
) => {
  if (restored.has(tab)) return;
  restored.add(tab);
  // placed meanwhile, which counts more
  if (
    !stored ||
    !(stored.stamps.length || stored.fills.length || stored.dismissed.length) ||
    stampBooks.value.has(tab)
  )
    return;
  const opened = doc.opened;
  if (!opened || opened.sha256 === stored.sha256) {
    write(tab, {
      book: bookOf(stored.stamps, stored.fills, stored.dismissed),
      sha256: stored.sha256,
    });
    return;
  }
  const kept = onPages(stored.stamps, opened.pages.length);
  write(tab, { book: bookOf(kept), sha256: opened.sha256 });
  const dropped = stored.stamps.length - kept.length;
  const lost = [
    dropped > 0
      ? `${dropped === 1 ? "1 stamp was" : `${dropped} stamps were`} on pages it no longer has`
      : "",
    stored.fills.length > 0 ? "its form is empty again" : "",
  ].filter(Boolean);
  if (lost.length)
    announce(
      `${basename(doc.path)} changed since you last had it open; ${lost.join(", and ")}`,
    );
};

/**
 * resetStampBooks forgets every tab's stamps and what was restored, for the
 * tests
 */
export const resetStampBooks = () => {
  restored.clear();
  stampBooks.value = new Map();
};
