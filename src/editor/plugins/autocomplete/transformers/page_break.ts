import { schema } from "../../../../markdown";

import type { BlockTransformer } from "../types";
import { replaceLineWith } from "./util";

// `+++` then Enter starts a new page
const rePageBreak = /^\+\+\+$/;

const _transformer: BlockTransformer<boolean> = {
  trigger: "enter",
  activate: (line: string) => rePageBreak.test(line) || undefined,
  transform: (view) => replaceLineWith(view, schema.nodes.page_break),
};

export default _transformer;
