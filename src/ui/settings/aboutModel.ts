import { getVersion } from "@tauri-apps/api/app";

// About in the settings (AboutSection.vue): Blank's version, its links, and
// the licenses of the software it uses.

export const WEBSITE = "https://blank-writer.xyz/";
export const SOURCE_CODE = "https://github.com/fpurchess/blank";
// the licenses of every crate and npm package Blank ships, served from
// public/ (make notices)
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

/**
 * loadNotices returns the text of the third-party notices
 * @throws if they can't be loaded
 */
export const loadNotices = async () => {
  const response = await fetch(NOTICES);
  if (!response.ok) throw new Error(`${response.status}`);
  return response.text();
};
