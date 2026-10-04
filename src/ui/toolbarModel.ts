/**
 * keepFocus keeps the focus where it is, in the editor, when a bar or a
 * toolbar is pressed, except in its fields
 */
export const keepFocus = (event: MouseEvent) => {
  if (!(event.target as Element).closest("input, textarea")) {
    event.preventDefault();
  }
};
