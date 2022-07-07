import markdownit from 'markdown-it';
import { DOMSerializer, Node } from 'prosemirror-model';
import { MarkdownParser, MarkdownSerializer } from 'prosemirror-markdown';

import { schema } from './schema';

// FIXME
type Token = any;

function listIsTight(tokens: readonly Token[], i: number) {
  while (++i < tokens.length) if (tokens[i].type != 'list_item_open') return tokens[i].hidden;
  return false;
}

export const markdownParser = new MarkdownParser(schema, markdownit('commonmark', { html: false }), {
  paragraph: { block: 'paragraph' },
  list_item: { block: 'list_item' },
  bullet_list: { block: 'bullet_list', getAttrs: (_, tokens, i) => ({ tight: listIsTight(tokens, i) }) },
  ordered_list: {
    block: 'ordered_list',
    getAttrs: (tok, tokens, i) => ({
      order: +tok.attrGet('start') || 1,
      tight: listIsTight(tokens, i),
    }),
  },
  heading: { block: 'heading', getAttrs: (tok) => ({ level: +tok.tag.slice(1) }) },
  hardbreak: { node: 'hard_break' },
  u: { mark: 'u' },
  em: { mark: 'em' },
  strong: { mark: 'strong' },
});

export const markdownSerializer = new MarkdownSerializer(
  {
    heading(state, node) {
      state.write(state.repeat('#', node.attrs.level) + ' ');
      state.renderInline(node);
      state.closeBlock(node);
    },
    bullet_list(state, node) {
      state.renderList(node, '  ', () => (node.attrs.bullet || '*') + ' ');
    },
    ordered_list(state, node) {
      let start = node.attrs.order || 1;
      let maxW = String(start + node.childCount - 1).length;
      let space = state.repeat(' ', maxW + 2);
      state.renderList(node, space, (i) => {
        let nStr = String(start + i);
        return state.repeat(' ', maxW - nStr.length) + nStr + '. ';
      });
    },
    list_item(state, node) {
      state.renderContent(node);
    },
    paragraph(state, node) {
      state.renderInline(node);
      state.closeBlock(node);
    },
    hard_break(state, node, parent, index) {
      for (let i = index + 1; i < parent.childCount; i++)
        if (parent.child(i).type != node.type) {
          state.write('\\\n');
          return;
        }
    },
    text(state, node) {
      state.text(node.text!);
    },
  },
  {
    u: { open: '*', close: '*', mixable: true, expelEnclosingWhitespace: true },
    em: { open: '*', close: '*', mixable: true, expelEnclosingWhitespace: true },
    strong: { open: '**', close: '**', mixable: true, expelEnclosingWhitespace: true },
  }
);

const domSerializer = DOMSerializer.fromSchema(schema);
export const htmlSerializer = (doc: Node) => {
  const dom = domSerializer.serializeFragment(doc.content);
  if (dom instanceof HTMLElement) {
    return dom.innerHTML;
  }
  const tmp = document.createElement('div');
  tmp.appendChild(dom);
  return tmp.innerHTML;
};
