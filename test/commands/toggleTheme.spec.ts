/**
 * @vitest-environment jsdom
 */
import { assert, describe, expect, it, vi } from 'vitest';

import { toggleTheme } from '../../src/commands';

describe('command.toggleTheme', () => {
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
