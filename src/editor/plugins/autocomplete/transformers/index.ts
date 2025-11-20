import type { Transformer } from "../types";

import arrows from "./arrows";
import blockquote from "./blockquote";
import heading from "./heading";
import bullet_list from "./bullet_list";
import link from "./link";

const transformers: { [key: string]: Transformer<any> } = {
  arrows,
  heading,
  blockquote,
  bullet_list,
  link,
  //
};

export default transformers;
