/**
 * @vitest-environment jsdom
 */
import { clearMocks, mockWindows } from '@tauri-apps/api/mocks';
import {
  afterEach,
  assert,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { toggleTheme } from '../../src/commands';
import { theme } from '../../src/state';

describe('command.toggleTheme', () => {
  beforeEach(() => {
    mockWindows('main');
  });

  afterEach(() => {
    clearMocks();
  });

  it('toggles', () => {
    expect(window).toBeDefined();

    const bodyTheme = () => document.body.dataset.theme;
    assert.equal(theme.value, 'dark');
    assert.equal(bodyTheme(), undefined);

    toggleTheme()();

    assert.equal(theme.value, 'light');
    assert.equal(bodyTheme(), 'light');

    toggleTheme()();

    assert.equal(theme.value, 'dark');
    assert.equal(bodyTheme(), 'dark');
  });
});
