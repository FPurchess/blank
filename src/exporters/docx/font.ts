import regular from "../../../fonts/IBMPlexSans-Regular.ttf?url";

// The regular face of IBM Plex Sans, which the Word export embeds as it is
// (see CLAUDE.md), loaded on the first export.

let font: Promise<Uint8Array> | undefined;

export const loadFont = () =>
  (font ??= fetch(regular).then(
    async (response) => new Uint8Array(await response.arrayBuffer()),
  ));
