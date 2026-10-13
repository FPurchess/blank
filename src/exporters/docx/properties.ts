// The custom document property that keeps a document's frontmatter in the
// Word export, and that the Word import reads back.
export const FRONTMATTER_PROPERTY = "BlankFrontmatter";

/**
 * pictureName returns the name of the `count`th picture of the Word export,
 * with its width, if it has one, which the Word import reads back
 * (src/importers/docx/widths.ts)
 */
export const pictureName = (count: number, width: string | null) =>
  `image-${count}${width ? ` blank-width=${encodeURIComponent(width)}` : ""}`;
