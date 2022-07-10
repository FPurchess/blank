/**
 * @vitest-environment jsdom
 */
import {
  assert,
  describe,
  expect,
  it,
  vi,
  beforeEach,
  beforeAll,
} from 'vitest';

import { bootUI } from '../src/ui';
import { path, textContent } from '../src/state';

beforeAll(() => {
  expect(window).toBeDefined();
  window.Notification = {
    permission: 'granted',
  };
  bootUI();
});

describe('ui', () => {
  it('updates the file path display', () => {
    expect(window).toBeDefined();
    const uiTop = document.querySelector<HTMLElement>('#ui-top');

    assert.equal(uiTop.innerHTML, '» Untitled');

    path.value = '/this/is/a/test/path';

    assert.equal(uiTop.innerHTML, `» ${path.value}`);
  });

  it('updates the word and char count', () => {
    expect(window).toBeDefined();
    const uiBottom = document.querySelector<HTMLElement>('#ui-bottom');

    assert.equal(uiBottom.innerHTML, '0 words 0 chars');

    textContent.value = 'one two three four';
    const charCount = textContent.value.length;
    const wordCount = textContent.value.split(/\s/).length;

    assert.equal(uiBottom.innerHTML, `${wordCount} words ${charCount} chars`);
  });
});
