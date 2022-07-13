/**
 * @vitest-environment jsdom
 */
import {
  afterEach,
  assert,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';

import { clearMocks, mockIPC, mockWindows } from '@tauri-apps/api/mocks';
import { Options } from '@tauri-apps/api/notification';

import { _saveFile } from '../../src/commands/saveFile';
import { schema } from '../../src/schema';
import { path } from '../../src/state';

describe('command.saveFile', () => {
  beforeEach(() => {
    mockWindows('main');
  });

  afterEach(() => {
    clearMocks();
  });

  it('invokes `save_file` cmd', async () => {
    window.Notification = class {};

    mockIPC(() => {});

    document.body.innerHTML = '';
    const state = EditorState.create({ schema });
    const app = document.createElement('div');
    document.body.appendChild(app);
    const view = new EditorView(app, { state });

    const spy = vi.spyOn(window, '__TAURI_IPC__');
    await _saveFile(state, {});

    expect(spy).toHaveBeenCalled();
    expect(spy.calls[1][0].cmd).toEqual('save_file');
  });

  it('notifies on success', async () => {
    let callArgs: Options | string[] = [];
    class NotificationMock {
      constructor(options: Options | string) {
        callArgs.push(options);
      }
    }
    window.Notification = NotificationMock;

    mockIPC(() => {});

    document.body.innerHTML = '';
    const state = EditorState.create({ schema });
    const app = document.createElement('div');
    document.body.appendChild(app);
    const view = new EditorView(app, { state });

    await _saveFile(state, {});

    expect(callArgs.length).toEqual(1);
    expect(callArgs[0]).toBeTypeOf('string');
    expect(callArgs[0]).toEqual('Your file has been saved');
  });
  it('uses the previously set path if not forced', async () => {
    let callArgs: Options | string[] = [];
    class NotificationMock {
      constructor(options: Options | string) {
        callArgs.push(options);
      }
    }
    window.Notification = NotificationMock;

    mockIPC(() => {});

    document.body.innerHTML = '';
    const state = EditorState.create({ schema });
    const app = document.createElement('div');
    document.body.appendChild(app);
    const view = new EditorView(app, { state });

    const pathTestValue = '/path/test/value';
    path.value = pathTestValue;

    const spy = vi.spyOn(window, '__TAURI_IPC__');
    await _saveFile(state, {});

    expect(spy).toHaveBeenCalled();
    expect(spy.calls[0][0].cmd).toEqual('save_file');
    expect(spy.calls[0][0].content).toEqual('');
    expect(spy.calls[0][0].path).toEqual(pathTestValue);
  });
});
