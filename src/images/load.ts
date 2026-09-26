import { readFile } from "@tauri-apps/plugin-fs";
import { fetch } from "@tauri-apps/plugin-http";

import { fromDataUrl } from "./dataUrl";
import { type ImageMime, sniffMime } from "./mime";
import { classifySrc, resolveLocalPath } from "./src";
import { errorMessage } from "../errors";

export const REMOTE_TIMEOUT_MS = 10_000;
export const MAX_REMOTE_BYTES = 20 * 1024 * 1024;

export type LoadedImage = { bytes: Uint8Array; mime: ImageMime };
export type LoadResult = LoadedImage | { error: string };

const loadRemote = async (url: string): Promise<Uint8Array> => {
  // the HTTP plugin fetches from Rust, so image hosts don't need CORS headers
  const response = await fetch(url, {
    connectTimeout: REMOTE_TIMEOUT_MS,
    signal: AbortSignal.timeout(REMOTE_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const length = Number(response.headers.get("content-length"));
  if (length > MAX_REMOTE_BYTES) throw new Error("the image is too large");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length > MAX_REMOTE_BYTES)
    throw new Error("the image is too large");
  return bytes;
};

const loadBytes = async (src: string, docPath: string | null) => {
  switch (classifySrc(src)) {
    case "data": {
      const decoded = fromDataUrl(src);
      if (!decoded) throw new Error("invalid data URL");
      return decoded.bytes;
    }
    case "remote":
      return loadRemote(src);
    default: {
      const path = resolveLocalPath(src, docPath);
      if (path === null) {
        throw new Error("save the document to resolve relative images");
      }
      return readFile(path);
    }
  }
};

/**
 * loadImage reads the bytes of an image `src` from a data: URL, the web or
 * the file system (relative to the document at `docPath`)
 * @returns the bytes and their MIME type, or the reason it failed
 */
export const loadImage = async (
  src: string,
  docPath: string | null,
): Promise<LoadResult> => {
  try {
    const bytes = await loadBytes(src, docPath);
    const mime = sniffMime(bytes);
    if (!mime) return { error: "not an image" };
    return { bytes, mime };
  } catch (err) {
    return { error: errorMessage(err) };
  }
};
