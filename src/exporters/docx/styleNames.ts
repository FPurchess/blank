// The names of the styles Blank's Word export writes, which the Word import
// maps back (src/importers/docx/styleMap.ts). Word shows them, and readers
// match styles by them.
export const STYLE_NAMES = {
  quote: "Quote",
  codeBlock: "Code Block",
  horizontalLine: "Horizontal Line",
  inlineCode: "Inline Code",
  caption: "Caption",
  tableHeading: "Table Heading",
} as const;
