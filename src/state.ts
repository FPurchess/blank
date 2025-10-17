import { Transaction } from "prosemirror-state";
import { Node } from "prosemirror-model";

import { debounce, Observable } from "observable.ts";

export const path = new Observable<string | null>(null);

export const transaction = new Observable<Transaction | null>(null);

export const textContent = new Observable("");
transaction.subscribe(
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  debounce((transaction: Transaction) => {
    if (transaction !== null) {
      let content = "";
      transaction.doc.descendants((node: Node) => {
        if (node.marks.find((mark) => mark.type.name === "deletion")) {
          //
        } else if (node.isBlock) {
          content += "\n";
        } else if (node.isText) {
          content += node.text ?? "";
        }
      });
      content = content.replaceAll(/[\n|\s]{2,}/g, " ").trim();
      textContent.value = content;
    }
  }, 50),
);

export const themes: string[] = [
  "light",
  "dark",
  "black",
  "red",
  "green",
  "blue",
];

export type themeType = (typeof themes)[number];
export const theme = new Observable<themeType>("light");
theme.subscribe((value: themeType) => {
  document.body.dataset.theme = value;
});
