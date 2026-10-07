// The state that Blank's modules share, in one place: modules talk through
// these refs instead of importing each other. See .claude/rules/state.md.
import { bootScope } from "../scope";
import { bootAppearance } from "./appearance";
import { bootDocumentState } from "./document";
import { bootMessages } from "./messages";

export * from "./appearance";
export * from "./blocksPane";
export * from "./dialogs";
export * from "./document";
export * from "./focus";
export * from "./focusMode";
export * from "./headings";
export * from "./language";
export * from "./mainMenu";
export * from "./messages";
export * from "./outline";
export * from "./page";
export * from "./pageView";
export * from "./popups";
export * from "./print";
export * from "./recent";
export * from "./settingsDialog";
export * from "./spellcheck";
export * from "./tabs";
export * from "./toolbar";

/**
 * bootState starts what the state keeps up to date by itself: the theme on
 * the document body, the document's text, and messages that clear after a
 * moment
 * @returns dispose, which stops all of it
 */
export const bootState = () =>
  bootScope(() => {
    bootAppearance();
    bootDocumentState();
    bootMessages();
  });
