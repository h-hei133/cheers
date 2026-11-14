import type { ExtensionUiDialogOptions, ExtensionUiHost } from '../../extensions/runtime/ui.js';
import type { OverlayStack } from '../../presentation/tui/render/overlayStack.js';
import { ExtensionDialogs } from './extensions/dialog.js';
import { editorDialog, inputDialog, selectionDialog } from './extensions/components.js';
import { dialogText, INPUT_LIMIT_NOTICE, MAX_UI_EDITOR_BYTES, singleLine } from './extensions/limits.js';
import { ExtensionChromeState } from './extensions/chrome.js';

export interface ExtensionChrome {
  readonly status: readonly string[];
  readonly aboveEditor: readonly string[];
  readonly belowEditor: readonly string[];
}

export interface ExtensionUiAdapterOptions {
  readonly overlays: OverlayStack;
  /** The runtime binding is live, independently of other input owners. */
  readonly admitted: () => boolean;
  readonly available: () => boolean;
  readonly changed: () => void;
  readonly settled?: () => void;
  readonly notify: NonNullable<ExtensionUiHost['notify']>;
  readonly setTitle: NonNullable<ExtensionUiHost['setTitle']>;
  readonly setEditorText: NonNullable<ExtensionUiHost['setEditorText']>;
}

function cancelled(options?: ExtensionUiDialogOptions): boolean {
  return options?.signal?.aborted === true;
}

/** Presentation state belongs to the interactive lifetime, never to initialization. */
export function createExtensionUiAdapter(options: ExtensionUiAdapterOptions) {
  const dialogs = new ExtensionDialogs(options.overlays, options.changed, options.admitted, options.settled);
  const chrome = new ExtensionChromeState();
  const inputNotice = () => options.notify(INPUT_LIMIT_NOTICE, 'warning');
  let disposed = false;
  const requireHost = (input = false) => {
    if (disposed || !options.admitted() || (input && (!options.available() || dialogs.active))) throw new Error('Extension UI is unavailable.');
  };
  const host: Required<ExtensionUiHost> = {
    select(title, choices, opts) {
      requireHost(); if (cancelled(opts)) return Promise.resolve(undefined); requireHost(true);
      const dialog = selectionDialog(title, choices);
      return choices.length ? dialogs.open(dialog, opts) : Promise.resolve(undefined);
    },
    async confirm(title, message, opts) { requireHost(); if (cancelled(opts)) return false; requireHost(true); return await dialogs.open(selectionDialog(title, ['No', 'Yes'], message), opts) === 'Yes'; },
    input(title, placeholder, opts) { requireHost(); if (cancelled(opts)) return Promise.resolve(undefined); requireHost(true); return dialogs.open(inputDialog(title, placeholder, inputNotice), opts); },
    editor(title, prefill, opts) { requireHost(); if (cancelled(opts)) return Promise.resolve(undefined); requireHost(true); return dialogs.open(editorDialog(title, prefill, inputNotice), opts); },
    notify(message, type) { requireHost(); options.notify(dialogText(message).replace(/\t/g, ' '), type); },
    setStatus(key, text) {
      requireHost();
      chrome.setStatus(key, text);
      options.changed();
    },
    setWidget(key, lines, placement = 'aboveEditor') {
      requireHost();
      chrome.setWidget(key, lines, placement);
      options.changed();
    },
    setTitle(title) { requireHost(); options.setTitle(singleLine(title)); },
    setEditorText(text) { requireHost(true); options.setEditorText(dialogText(text, MAX_UI_EDITOR_BYTES)); },
  };
  return {
    host,
    get active(): boolean { return dialogs.active; },
    chrome(): ExtensionChrome {
      if (!options.admitted()) { chrome.clear(); dialogs.cancel(); }
      return chrome.read();
    },
    clear() { dialogs.cancel(); chrome.clear(); options.changed(); },
    cancelDialogs() { dialogs.cancel(); },
    dispose() { disposed = true; dialogs.cancel(); chrome.clear(); options.changed(); },
  };
}
