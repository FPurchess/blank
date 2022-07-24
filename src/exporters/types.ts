import { BinaryFileContents } from '@tauri-apps/api/fs';
import { EditorState } from 'prosemirror-state';

export type exporterFunc = (state: EditorState) => Promise<BinaryFileContents>;
