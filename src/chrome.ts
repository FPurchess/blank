// The heights of the window's bars, in px, for code that places things by
// them: the top bar ($top-bar-height in src/scss/main.scss), the status bar
// at the bottom ($status-height in src/scss/_statusbar.scss), and the line of
// a header or footer at rest ($band-height in main.scss). chrome.test.ts
// checks them against the SCSS. No imports, so the E2E tests can use it too.

export const TOP_BAR_HEIGHT = 44;
export const STATUS_HEIGHT = 32;
export const BAND_HEIGHT = 28;
