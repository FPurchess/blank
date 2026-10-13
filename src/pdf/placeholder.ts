import { type EditorState, Plugin } from "prosemirror-state";

// A PDF tab's editor state: the PDF isn't text the editor holds, so the tab
// shows an empty document with this plugin, which keeps it empty and gives
// the focus the editor gets on to the PDF's pages (PdfView.vue). Whatever
// gives "the text" the focus (a dialog that closes, Esc in the tab row, F6)
// thus reaches the PDF.

// the page view of PDFs, which takes the focus in a PDF tab
export const PDF_VIEW_ID = "pdf-view";

export const pdfPlaceholderPlugin = new Plugin({
  filterTransaction: (tr) => !tr.docChanged,
  props: {
    handleDOMEvents: {
      focus: () => {
        document.getElementById(PDF_VIEW_ID)?.focus();
        return false;
      },
    },
  },
});

/**
 * pdfPlaceholder returns the state a PDF tab shows in the editor: `empty`,
 * an empty document with the editor's plugins, and the plugin above
 */
export const pdfPlaceholder = (empty: EditorState): EditorState =>
  empty.reconfigure({ plugins: [...empty.plugins, pdfPlaceholderPlugin] });
