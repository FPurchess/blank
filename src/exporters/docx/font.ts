import regular from "../../../fonts/IBMPlexSans-Regular.ttf?url";

// The regular face of IBM Plex Sans, which the Word export embeds as it is
// (see CLAUDE.md), loaded on the first export. A load that fails is tried
// again with the next export.

let font: Promise<Uint8Array> | undefined;

export const loadFont = () =>
  (font ??= fetch(regular)
    .then(async (response) => {
      if (!response.ok)
        throw new Error(`failed to load the font: HTTP ${response.status}`);
      return new Uint8Array(await response.arrayBuffer());
    })
    .catch((error: unknown) => {
      font = undefined;
      throw error;
    }));
