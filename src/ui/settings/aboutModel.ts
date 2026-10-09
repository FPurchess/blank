import { getVersion } from "@tauri-apps/api/app";

// About in the settings (AboutSection.vue): Blank's version, its links, and
// the licenses of the software it uses.

// the licenses of every crate, npm package, font and dictionary Blank ships,
// served from public/ (make notices)
export const NOTICES = "/THIRD-PARTY-NOTICES.txt";

/**
 * appVersion returns Blank's version: the app's, or in a plain browser (bun
 * run dev) the package's, or undefined without either
 */
export const appVersion = async (): Promise<string | undefined> => {
  const fallback =
    typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : undefined;
  try {
    return (await getVersion()) || fallback;
  } catch {
    return fallback;
  }
};

// the lines of the notices drawn at once: drawing all of them (over 10,000)
// in one block holds the webview up for most of a second
const NOTICE_LINES = 400;

/**
 * chunksOf splits `text` into blocks of `lines` lines, which the licenses
 * page draws one after the other
 */
export const chunksOf = (text: string, lines = NOTICE_LINES) => {
  const all = text.split("\n");
  const chunks: string[] = [];
  for (let i = 0; i < all.length; i += lines)
    chunks.push(all.slice(i, i + lines).join("\n"));
  return chunks;
};

/**
 * loadNotices returns the text of the third-party notices
 * @throws if they can't be loaded
 */
export const loadNotices = async () => {
  const response = await fetch(NOTICES);
  if (!response.ok) throw new Error(`${response.status}`);
  return response.text();
};
