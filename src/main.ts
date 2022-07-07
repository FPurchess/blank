import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { keymap } from "prosemirror-keymap";
import { undo, redo, history } from "prosemirror-history";
import {
  baseKeymap,
  setBlockType,
  toggleMark,
  chainCommands,
} from "prosemirror-commands";
import {
  liftListItem,
  sinkListItem,
  wrapInList,
  splitListItem,
} from "prosemirror-schema-list";

import {
  newFile,
  openFile,
  saveFile,
  exportAsPDF,
  toggleTheme,
} from "./commands";
import { updateUIStats } from "./ui";
import { schema } from "./schema";

import "./main.scss";

const state = EditorState.create({
  schema,
  plugins: [
    history(),
    keymap({
      ...baseKeymap,
      "Mod-z": undo,
      "Mod-Shift-z": redo,
      "Mod-0": setBlockType(schema.nodes.paragraph),
      "Mod-1": setBlockType(schema.nodes.heading, { level: 1 }),
      "Mod-2": setBlockType(schema.nodes.heading, { level: 2 }),
      "Mod-3": setBlockType(schema.nodes.heading, { level: 3 }),
      "Mod-4": setBlockType(schema.nodes.heading, { level: 4 }),
      "Mod-5": setBlockType(schema.nodes.heading, { level: 5 }),
      "Mod-6": setBlockType(schema.nodes.heading, { level: 6 }),
      "Mod-8": wrapInList(schema.nodes.bullet_list),
      "Mod-9": wrapInList(schema.nodes.ordered_list),
      Enter: chainCommands(
        splitListItem(schema.nodes.list_item),
        baseKeymap["Enter"]
      ),
      "Mod-[": liftListItem(schema.nodes.list_item),
      "Mod-]": sinkListItem(schema.nodes.list_item),
      "Mod-b": toggleMark(schema.marks.strong),
      "Mod-i": toggleMark(schema.marks.em),
      "Mod-u": toggleMark(schema.marks.u),
      "Mod-n": newFile(),
      "Mod-s": saveFile(),
      "Mod-Shift-s": saveFile(true),
      "Mod-Alt-p": exportAsPDF(),
      "Mod-o": openFile(),
      "Mod-Alt-t": toggleTheme(),
    }),
  ],
});
const app = document.querySelector<HTMLDivElement>("#app")!;
const view = new EditorView(app, {
  state,
  handleDOMEvents: {
    blur: (view: EditorView, e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      window.setTimeout(() => view.focus(), 100);
      return true;
    },
  },
  dispatchTransaction(transaction) {
    updateUIStats(transaction);
    view.updateState(view.state.apply(transaction));
  },
});
window.setTimeout(() => view.focus(), 100);
