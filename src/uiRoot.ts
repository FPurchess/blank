const ROOT_ID = "ui";

/**
 * uiRoot returns the element that holds the UI around the editor: the bars,
 * dialogs, menus, pickers and toolbars. It comes after the editor, so the
 * bars paint above the text, and it's created on first use.
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
