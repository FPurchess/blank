const ROOT_ID = "ui";

/**
 * uiRoot returns the element that holds the UI around the editor: the bars,
 * dialogs, menus, pickers and toolbars. It's appended to the body on first
 * use, which bootUI makes after bootEditor, so it comes after the editor and
 * the bars paint above the text.
 */
export const uiRoot = (): HTMLElement => {
  let root = document.getElementById(ROOT_ID);
  if (!root) {
    root = document.createElement("div");
    root.id = ROOT_ID;
    document.body.append(root);
  }
  return root;
};
