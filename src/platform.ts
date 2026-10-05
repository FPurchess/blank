/**
 * isMac tells whether Blank runs on macOS (or iOS), where Cmd takes the
 * place of Ctrl in shortcuts and Ctrl+Click is the secondary click
 */
export const isMac = () => /Mac|iP(hone|[oa]d)/.test(navigator.platform);
