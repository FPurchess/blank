import type { Command } from "prosemirror-state";

import { theme, themes } from "../../state";

export default (): Command => () => {
  const currentIndex = themes.indexOf(theme.value);
  const nextIndex = (currentIndex + 1) % themes.length;
  theme.value = themes[nextIndex];
  return true;
};
