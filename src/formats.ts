// The file formats Blank reads and writes, and how the file dialogs offer
// them.

// markdown files, which Blank opens and saves
export const MARKDOWN_EXTENSIONS = ["md", "markdown", "mdown", "mkd", "mkdn"];
// Word documents, which are imported into an untitled markdown document
export const WORD_EXTENSIONS = ["docx", "docm", "dotx", "dotm"];
// document formats Blank can't read, which aren't markdown either
export const UNREADABLE_EXTENSIONS = ["doc", "odt", "rtf", "pages"];
// files that saving markdown into would destroy, e.g. the Word document a
// document was imported from, or an exported PDF
export const NOT_MARKDOWN = [
  ...WORD_EXTENSIONS,
  ...UNREADABLE_EXTENSIONS,
  "pdf",
];

export const MARKDOWN_FILTER = { name: "Markdown", extensions: ["md"] };
export const WORD_FILTER = { name: "Word Document", extensions: ["docx"] };
export const PDF_FILTER = { name: "PDF-File", extensions: ["pdf"] };
// what the open dialog offers; Linux dialogs start with the first
export const OPEN_FILTERS = [
  { name: "Documents", extensions: ["md", "docx"] },
  MARKDOWN_FILTER,
  WORD_FILTER,
];
