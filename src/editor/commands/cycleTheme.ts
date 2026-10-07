import type { Command } from "prosemirror-state";

import { theme, themes } from "../../state";

export default (): Command => (_state, dispatch) => {
  if (!dispatch) return true;
  const currentIndex = themes.indexOf(theme.value);
  const nextIndex = (currentIndex + 1) % themes.length;
  theme.value = themes[nextIndex];
  return true;
};
