// The fonts the engine lays out with, in the order of FONT_FILES in
// src-tauri/layout/src/fonts.rs: IBM Plex Sans with DejaVu Sans for what it
// lacks, and IBM Plex Mono for code. IBM's, DejaVu's and Google's files as
// they are.
import regular from "../../fonts/IBMPlexSans-Regular.ttf?url";
import italic from "../../fonts/IBMPlexSans-Italic.ttf?url";
import medium from "../../fonts/IBMPlexSans-Medium.ttf?url";
import mediumItalic from "../../fonts/IBMPlexSans-MediumItalic.ttf?url";
import bold from "../../fonts/IBMPlexSans-Bold.ttf?url";
import boldItalic from "../../fonts/IBMPlexSans-BoldItalic.ttf?url";
import dejavu from "../../fonts/dejavu-sans.ttf?url";
import dejavuOblique from "../../fonts/dejavu-sans-oblique.ttf?url";
import dejavuBold from "../../fonts/dejavu-sans-bold.ttf?url";
import dejavuBoldOblique from "../../fonts/dejavu-sans-bold-oblique.ttf?url";
import mono from "../../fonts/IBMPlexMono-Regular.ttf?url";
import monoItalic from "../../fonts/IBMPlexMono-Italic.ttf?url";
import monoBold from "../../fonts/IBMPlexMono-Bold.ttf?url";
import monoBoldItalic from "../../fonts/IBMPlexMono-BoldItalic.ttf?url";
// loaded only for a document with emoji, see fallback.ts
import emoji from "../../fonts/NotoEmoji-VariableFont_wght.ttf?url";

export const EMOJI_URL = emoji;
export const EMOJI_FAMILY = "Noto Emoji";

export const FONT_URLS = [
  regular,
  italic,
  medium,
  mediumItalic,
  bold,
  boldItalic,
  dejavu,
  dejavuOblique,
  dejavuBold,
  dejavuBoldOblique,
  mono,
  monoItalic,
  monoBold,
  monoBoldItalic,
];

// the file names, for loading them from disk in tests and scripts
export const FONT_FILES = [
  "IBMPlexSans-Regular.ttf",
  "IBMPlexSans-Italic.ttf",
  "IBMPlexSans-Medium.ttf",
  "IBMPlexSans-MediumItalic.ttf",
  "IBMPlexSans-Bold.ttf",
  "IBMPlexSans-BoldItalic.ttf",
  "dejavu-sans.ttf",
  "dejavu-sans-oblique.ttf",
  "dejavu-sans-bold.ttf",
  "dejavu-sans-bold-oblique.ttf",
  "IBMPlexMono-Regular.ttf",
  "IBMPlexMono-Italic.ttf",
  "IBMPlexMono-Bold.ttf",
  "IBMPlexMono-BoldItalic.ttf",
];

// the emoji font's file, for tests
export const EMOJI_FILE = "NotoEmoji-VariableFont_wght.ttf";
