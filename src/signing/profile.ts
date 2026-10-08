import { path } from "@tauri-apps/api";
import {
  exists,
  mkdir,
  readTextFile,
  remove,
  rename,
  writeTextFile,
} from "@tauri-apps/plugin-fs";

import type { Stroke } from "./pad";
import { isSignatureFont, type SignatureFont } from "./fonts";
import { logWarning } from "../log";

// The user's signature and initials: one JSON file each in the folder
// `signing` of the app config dir, holding how it was made (so the dialog
// opens it as it was) and the picture every signature shows, a transparent
// PNG as a data URL, which the pages, the PDF and Word take as any image.

export type Mark = "signature" | "initials";

export type MarkSource =
  | { kind: "draw"; strokes: Stroke[] }
  | { kind: "type"; text: string; font: SignatureFont }
  | { kind: "image" };

export interface SavedMark {
  source: MarkSource;
  // data:image/png;base64,…
  png: string;
  // its size in pixels, for laying it out before it is decoded
  width: number;
  height: number;
}

const FOLDER = "signing";

const dirOf = async () => await path.join(await path.appConfigDir(), FOLDER);

const fileOf = async (mark: Mark) =>
  await path.join(await dirOf(), `${mark}.json`);

const isStroke = (value: unknown): value is Stroke =>
  Array.isArray(value) &&
  value.every(
    (point) =>
      Array.isArray(point) &&
      point.length === 3 &&
      point.every(
        (number) => typeof number === "number" && Number.isFinite(number),
      ),
  );

/**
 * readSource reads how a mark was made, or returns null for what isn't one
 */
const readSource = (value: unknown): MarkSource | null => {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  if (source.kind === "image") return { kind: "image" };
  if (
    source.kind === "draw" &&
    Array.isArray(source.strokes) &&
    source.strokes.every(isStroke)
  ) {
    return { kind: "draw", strokes: source.strokes };
  }
  if (
    source.kind === "type" &&
    typeof source.text === "string" &&
    isSignatureFont(source.font)
  ) {
    return { kind: "type", text: source.text, font: source.font };
  }
  return null;
};

/**
 * readMark reads a saved signature or initials, or returns null for none or
 * a file that can't be used
 */
export const readMark = async (mark: Mark): Promise<SavedMark | null> => {
  let file: string = mark;
  try {
    file = await fileOf(mark);
    if (!(await exists(file))) return null;
    const saved = JSON.parse(await readTextFile(file)) as Record<
      string,
      unknown
    >;
    const source = readSource(saved.source);
    const { png, width, height } = saved;
    if (
      !source ||
      typeof png !== "string" ||
      !png.startsWith("data:image/png;base64,") ||
      typeof width !== "number" ||
      typeof height !== "number" ||
      !(width > 0 && height > 0)
    ) {
      logWarning(`ignored the unreadable ${mark} in ${file}`);
      return null;
    }
    return { source, png, width, height };
  } catch (error) {
    logWarning(`failed to read the ${mark} in ${file}`, error);
    return null;
  }
};

/**
 * writeMark saves a signature or initials; the file is replaced as a whole,
 * so it is never left half written
 */
export const writeMark = async (mark: Mark, saved: SavedMark) => {
  const file = await fileOf(mark);
  await mkdir(await dirOf(), { recursive: true });
  await writeTextFile(`${file}.tmp`, JSON.stringify(saved));
  await rename(`${file}.tmp`, file);
};

/**
 * removeMark forgets a signature or initials
 */
export const removeMark = async (mark: Mark) => {
  const file = await fileOf(mark);
  if (await exists(file)) await remove(file);
};
