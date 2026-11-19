import { types } from 'node:util';

export interface ExtensionShortcut {
  readonly key: string;
  readonly description?: string;
  readonly run?: () => unknown | Promise<unknown>;
}

export function captureShortcut(input: ExtensionShortcut): ExtensionShortcut {
  if (!input || typeof input !== 'object' || types.isProxy(input)) throw new Error('Invalid shortcut registration.');
  const key = shortcutField(input, 'key');
  const description = shortcutField(input, 'description');
  const run = shortcutField(input, 'run');
  if (typeof key !== 'string' || !key.trim() || key.length > 128
    || description !== undefined && (typeof description !== 'string' || description.length > 512)
    || run !== undefined && (typeof run !== 'function' || types.isProxy(run))) throw new Error('Invalid shortcut registration.');
  return { key, ...(description === undefined ? {} : { description }),
    ...(run === undefined ? {} : { run: run as NonNullable<ExtensionShortcut['run']> }) };
}

function shortcutField(input: ExtensionShortcut, name: keyof ExtensionShortcut): unknown {
  const field = Object.getOwnPropertyDescriptor(input, name);
  if (field && !('value' in field)) throw new Error('Invalid shortcut registration.');
  return field?.value;
}
