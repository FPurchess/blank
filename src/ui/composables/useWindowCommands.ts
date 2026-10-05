import { commandKeys, WINDOW_COMMANDS } from "../../editor/plugins/keymap";
import { useEditor } from "../../editor/handle";
import { listenOnWindow } from "../../scope";
import { contextMenu, focusTakingDialogs } from "../../state";

/**
 * useWindowCommands runs the commands of the window (the files, the tabs, F6)
 * on their keys wherever the focus is, e.g. in the tab row or the blocks
 * pane, not only in the editor, whose own keymap runs them there. A dialog
 * or menu that is open keeps its keys.
 */
export const useWindowCommands = () => {
  const editor = useEditor();
  const keys = commandKeys(WINDOW_COMMANDS);
  // the editor's own keymap runs them in it; a test view has no DOM
  const dom = editor.view.dom as Element | undefined;
  listenOnWindow("keydown", (event) => {
    if (event.defaultPrevented) return;
    const target = event.target;
    if (target instanceof Node && dom?.contains(target)) return;
    if (focusTakingDialogs.some((request) => request.value !== null)) return;
    if (contextMenu.value) return;
    if (keys(editor.view, event)) event.preventDefault();
  });
};
