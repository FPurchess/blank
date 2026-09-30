import type { PageDisplay, PageEngine } from "../engine/engine";
import type { PageLayoutState } from "../state";

// The two layers of a painted page: its text (the body) and its header and
// footer (the bands), which the engine versions apart (S6 in SEAM.md), so a
// change of one paints only that layer, e.g. {pages} in every footer when a
// page is added.
//
// Until PageEngine reads them itself (bodyDisplay, bandDisplay and the
// versions in pageLayoutState, engine-editor's), they are read from the
// wasm engine here; drop that once it does.

export type Layer = "body" | "bands";

interface Raw {
  pageBody?: (page: number) => string;
  pageBands?: (page: number) => string;
  bodyVersions?: () => Uint32Array;
  bandVersions?: () => Uint32Array;
}

type WithLayers = PageEngine & {
  bodyDisplay?: (page: number, version: number) => PageDisplay;
  bandDisplay?: (page: number, version: number) => PageDisplay;
};

// the displays read, by engine, layer and page, each with its version
const read = new WeakMap<
  PageEngine,
  Record<Layer, Map<number, { version: number; display: PageDisplay }>>
>();

/**
 * layerDisplay returns what one layer of a page shows, read again only when
 * its version changed
 */
export const layerDisplay = (
  engine: PageEngine,
  layer: Layer,
  page: number,
  version: number,
): PageDisplay => {
  const own = engine as WithLayers;
  const method = layer === "body" ? own.bodyDisplay : own.bandDisplay;
  if (method) return method.call(engine, page, version);
  const raw = engine.raw as unknown as Raw;
  const source = layer === "body" ? raw.pageBody : raw.pageBands;
  // an engine before S6: the whole page is its body
  if (!source) {
    return layer === "body"
      ? engine.display(page, version)
      : { r: [], i: [], l: [], g: [] };
  }
  let caches = read.get(engine);
  if (!caches) {
    caches = { body: new Map(), bands: new Map() };
    read.set(engine, caches);
  }
  const cached = caches[layer].get(page);
  if (cached?.version === version) return cached.display;
  const display = JSON.parse(source.call(engine.raw, page)) as PageDisplay;
  caches[layer].set(page, { version, display });
  return display;
};

/**
 * layerVersions returns the versions of each page's body and bands: those
 * the layout published, or else the engine's, or else the combined ones
 */
export const layerVersions = (
  state: PageLayoutState,
  engine: PageEngine | null,
): Record<Layer, Uint32Array> => {
  const raw = engine?.raw as unknown as Raw | undefined;
  return {
    body:
      state.bodyVersions ??
      raw?.bodyVersions?.call(engine!.raw) ??
      state.versions,
    bands:
      state.bandVersions ??
      raw?.bandVersions?.call(engine!.raw) ??
      state.versions,
  };
};

// how often the page frames rendered again, see PageFrame.vue
export const frameRenders = { count: 0 };
