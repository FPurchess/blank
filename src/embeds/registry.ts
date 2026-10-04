// The types of embeds Blank can make and edit (see
// src/markdown/blocks/embeds.ts). The plugins that bring them come later;
// until then, only tests register one. An embed of a type nobody registered
// still shows, prints and exports its drawing, and round-trips as it was.

// what editing an embed gives: its data, as the app keeps it, and how it
// looks, as SVG, which Blank cleans
export interface EmbedResult {
  data: string;
  lang?: "json" | "xml";
  svg: string;
  // how wide it is shown, e.g. "120mm"; as wide as the drawing without
  width?: string;
  // what it shows, for screen readers and where it can't be shown
  alt?: string;
}

export interface EmbedType {
  // its plugin's namespace, its name and the version of its data, e.g.
  // "org.excalidraw/scene@1"
  type: string;
  // what the block picker calls it
  name: string;
  description?: string;
  // makes a new one (`data` null) or edits one; null when the user gave up
  edit(data: string | null): Promise<EmbedResult | null>;
}

const types = new Map<string, EmbedType>();

/**
 * registerEmbedType makes Blank offer and edit embeds of `type`
 * @returns what takes it back
 */
export const registerEmbedType = (type: EmbedType) => {
  types.set(type.type, type);
  return () => {
    if (types.get(type.type) === type) types.delete(type.type);
  };
};

/**
 * embedTypes returns the types registered, in the order they came
 */
export const embedTypes = (): EmbedType[] => [...types.values()];

/**
 * embedType returns the registered type of an embed's `type`, if any
 */
export const embedType = (type: string) => types.get(type);
