import type { Command } from "prosemirror-state";

import { chooseTheme, theme, themes } from "../../state";

export default (): Command => (_state, dispatch) => {
  if (!dispatch) return true;
  const currentIndex = themes.indexOf(theme.value);
  const nextIndex = (currentIndex + 1) % themes.length;
  chooseTheme(themes[nextIndex]);
  return true;
};
