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
 * loadMarks reads the signature and initials once, so later calls are free
 */
export const loadMarks = () =>
  (reading ??= Promise.all([readMark("signature"), readMark("initials")]).then(
    ([signature, initials]) => {
      savedMarks.value = { signature, initials };
    },
  ));

/**
 * saveMark saves a signature or initials and publishes it
 */
export const saveMark = async (mark: Mark, saved: SavedMark) => {
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
  await removeMark(mark);
  savedMarks.value = {
    signature: null,
    initials: null,
    ...savedMarks.value,
    [mark]: null,
  };
};

/**
 * resetMarks forgets what was read, for the tests
 */
export const resetMarks = () => {
  reading = null;
  savedMarks.value = undefined;
};
