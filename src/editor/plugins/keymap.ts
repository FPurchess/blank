import { keymap } from 'prosemirror-keymap';
import { undo, redo } from 'prosemirror-history';
import {
  baseKeymap,
  setBlockType,
  toggleMark,
  chainCommands,
  wrapIn,
} from 'prosemirror-commands';
import {
  liftListItem,
  sinkListItem,
  wrapInList,
  splitListItem,
} from 'prosemirror-schema-list';
import { schema } from 'prosemirror-markdown';

import {
  newFile,
  openFile,
  saveFile,
  exportAs,
  toggleTheme,
  insertNode,
} from '../commands';

import * as exporters from '../../exporters';

export default keymap({
  ...baseKeymap,
  'Mod-z': undo,
  'Mod-Shift-z': redo,
  'Mod-0': setBlockType(schema.nodes.paragraph),
  'Mod-1': setBlockType(schema.nodes.heading, { level: 1 }),
  'Mod-2': setBlockType(schema.nodes.heading, { level: 2 }),
  'Mod-3': setBlockType(schema.nodes.heading, { level: 3 }),
  'Mod-4': setBlockType(schema.nodes.heading, { level: 4 }),
  'Mod-5': setBlockType(schema.nodes.heading, { level: 5 }),
  'Mod-6': setBlockType(schema.nodes.heading, { level: 6 }),
  'Mod-8': wrapInList(schema.nodes.bullet_list),
  'Mod-9': wrapInList(schema.nodes.ordered_list),
  Enter: chainCommands(splitListItem(schema.nodes.list_item), baseKeymap.Enter),
  'Mod-Enter': insertNode(schema.nodes.hard_break),
  'Shift-Enter': insertNode(schema.nodes.hard_break),
  'Mod-h': insertNode(schema.nodes.horizontal_rule),
  Tab: sinkListItem(schema.nodes.list_item),
  'Shift-Tab': liftListItem(schema.nodes.list_item),
  'Mod-b': toggleMark(schema.marks.strong),
  'Mod-i': toggleMark(schema.marks.em),
  'Mod-g': toggleMark(schema.marks.code),
  'Mod-h': wrapIn(schema.nodes.blockquote),
  'Mod-n': newFile(),
  'Mod-s': saveFile(),
  'Mod-Shift-s': saveFile({ force: true }),
  'Mod-Alt-p': exportAs('PDF-Export', exporters.toPDF, [
    { name: 'PDF-File', extensions: ['pdf'] },
  ]),
  'Mod-Alt-d': exportAs('Docx-Export', exporters.toDocx, [
    { name: 'Docx-File', extensions: ['docx'] },
  ]),
  'Mod-o': openFile(),
  'Mod-Alt-t': toggleTheme(),
});
