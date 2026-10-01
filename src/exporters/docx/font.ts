import mono from "../../../fonts/IBMPlexMono-Regular.ttf?url";
import sans from "../../../fonts/IBMPlexSans-Regular.ttf?url";

// The fonts the Word export embeds as they are (see CLAUDE.md): the regular
// faces of IBM Plex Sans for the text and IBM Plex Mono for code, loaded on
// the first export. A load that fails is tried again with the next export.

export interface EmbeddedFont {
  name: string;
  data: Uint8Array;
}

const FILES = [
  { name: "IBM Plex Sans", url: sans },
  { name: "IBM Plex Mono", url: mono },
];

const loaded = new Map<string, Promise<Uint8Array>>();

const load = (name: string, url: string) => {
  let font = loaded.get(name);
  if (!font) {
    font = fetch(url)
      .then(async (response) => {
        if (!response.ok)
          throw new Error(`failed to load the font: HTTP ${response.status}`);
        return new Uint8Array(await response.arrayBuffer());
      })
      .catch((error: unknown) => {
        loaded.delete(name);
        throw error;
      });
    loaded.set(name, font);
  }
  return font;
};

/**
 * loadFonts returns the fonts to embed, each loaded once
 */
export const loadFonts = (): Promise<EmbeddedFont[]> =>
  Promise.all(
    FILES.map(async ({ name, url }) => ({ name, data: await load(name, url) })),
  );
