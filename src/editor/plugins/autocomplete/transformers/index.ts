import { Transformer } from '../types';

import arrows from './arrows';
import blockquote from './blockquote';
import heading from './heading';
import bullet_list from './bullet_list';

const transformers: { [key: string]: Transformer<any> } = {
  arrows,
  heading,
  blockquote,
  bullet_list,
  //
};

export default transformers;
