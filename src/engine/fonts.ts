// The fonts the engine lays out with, in the order of FONT_FILES in
// src-tauri/layout/src/fonts.rs. IBM's and DejaVu's files as they are.
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
];
