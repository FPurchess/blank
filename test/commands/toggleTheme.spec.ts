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

describe('command.toggleTheme', () => {
  beforeEach(() => {
    mockWindows('main');
  });

  afterEach(() => {
    clearMocks();
  });

  it('toggles', () => {
    expect(window).toBeDefined();

    const theme = () => document.body.dataset.theme;
    assert.equal(theme(), undefined);

    toggleTheme()();

    assert.equal(theme(), 'dark');

    toggleTheme()();

    assert.equal(theme(), 'light');
  });
});
