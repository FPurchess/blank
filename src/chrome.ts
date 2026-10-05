// The heights of the window's bars, in px, for code that places things by
// them: the top area's two rows, the tab row and the formatting toolbar
// ($tab-row-height and $toolbar-height in src/scss/_toparea.scss), the status
// bar at the bottom ($status-height in src/scss/_statusbar.scss), and the line
// of a header or footer at rest ($band-height in main.scss). chrome.test.ts
// checks them against the SCSS. No imports, so the E2E tests can use it too.

export const TAB_ROW_HEIGHT = 40;
export const TOOLBAR_HEIGHT = 40;
// the whole top area, which the pages start below
export const TOP_BAR_HEIGHT = TAB_ROW_HEIGHT + TOOLBAR_HEIGHT;
export const STATUS_HEIGHT = 32;
export const BAND_HEIGHT = 28;

// The line the view is read at: where the outline and a table of contents put
// a heading they scroll to, so many pixels below the top of the page view, as
// on Notion (64 px below its bar).
export const READING_LINE = 64;

// The controls of the window, which fade in focus mode (src/ui/FocusMode.vue,
// the chrome-fade mixin in src/scss/_focusMode.scss): the top area (the tab
// row and the toolbar), the status bar, the outline, the blocks pane and the
// table and block toolbars. While the pointer is on one, they don't fade.
export const CHROME_SELECTOR =
  "#ui-top, #ui-bottom, #outline, #blocks-pane, .toolbar";
