import { EditorView } from 'prosemirror-view';

export type activator<T> = (text: string) => undefined | T;
export type transformer<T> = (
  view: EditorView,
  text: string,
  props: T,
) => boolean;

export interface Transformer<T> {
  activate: activator<T>;
  transform: transformer<T>;
}
