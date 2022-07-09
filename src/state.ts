import { Transaction } from "prosemirror-state";
import { DebouncedObservable, Observable } from "./utils/observable";

export const path = new Observable<string | null>(null);

export const transaction = new DebouncedObservable<Transaction | null>(
  null,
  50
);

export const textContent = new Observable("");
transaction.subscribe((transaction) => {
  if (transaction !== null) {
    let content = "";
    transaction.doc.descendants((node) => {
      if (node.marks.find((mark) => mark.type.name === "deletion")) {
        return;
      } else if (node.isBlock) {
        content += "\n";
      } else if (node.isText) {
        content += node.text;
      }
    });
    content = content.replaceAll(/[\n|\s]{2,}/g, " ").trim();
    textContent.value = content;
  }
});
