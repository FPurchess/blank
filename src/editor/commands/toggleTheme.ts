import { Command } from 'prosemirror-state';

import { theme } from '../../state';

export default (): Command => () => {
  theme.value = theme.value === 'dark' ? 'light' : 'dark';
  return true;
};
