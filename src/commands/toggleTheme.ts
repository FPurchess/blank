import { Command } from 'prosemirror-state';

export default (): Command => () => {
  const body = document.querySelector('body');
  if (body) {
    const theme = body.dataset.theme;
    body.dataset.theme = theme === 'dark' ? 'light' : 'dark';
  }
  return true;
};
