import { savedMarks } from "../state";
import {
  type Mark,
  readMark,
  removeMark,
  type SavedMark,
  writeMark,
} from "./profile";

// Reading and changing the user's signature and initials, published in
// `savedMarks` for the dialogs, the settings and the signed export.

let reading: Promise<void> | null = null;

/**
 * loadMarks reads the signature and initials once, so later calls are free;
 * after a failure, the next call reads them again
 */
export const loadMarks = () =>
  (reading ??= Promise.all([readMark("signature"), readMark("initials")])
    .then(([signature, initials]) => {
      savedMarks.value = { signature, initials };
    })
    .catch((error: unknown) => {
      reading = null;
      throw error;
    }));

/**
 * saveMark saves a signature or initials and publishes it, after what was
 * read, which would otherwise overwrite it
 */
export const saveMark = async (mark: Mark, saved: SavedMark) => {
  await loadMarks();
  await writeMark(mark, saved);
  savedMarks.value = {
    signature: null,
    initials: null,
    ...savedMarks.value,
    [mark]: saved,
  };
};

/**
 * forgetMark removes a signature or initials
 */
export const forgetMark = async (mark: Mark) => {
  await loadMarks();
  await removeMark(mark);
  savedMarks.value = {
    signature: null,
    initials: null,
    ...savedMarks.value,
    [mark]: null,
  };
};

/**
 * resetMarks forgets what was read, for the tests: the module's state,
 * which the state's ref alone doesn't reset
 */
export const resetMarks = () => {
  reading = null;
  savedMarks.value = undefined;
};
