import { types } from 'node:util';
import { isRecord } from '../../core/values/record.js';
import { normalizeKey } from '../../presentation/tui/input/keyId.js';
import type { ToolExecutionResult } from '../../tools/types.js';
import type { PackageRecord } from '../model.js';

export interface ExtensionShortcut {
  readonly key: string;
  readonly description?: string;
  readonly run?: () => unknown | Promise<unknown>;
  /** Installed packages may bind a command declared by the same script. */
  readonly command?: string;
}

export const MAX_SHORTCUTS = 128;

export function createShortcutCapture(isProxy: (value: unknown) => boolean) {
  const descriptor = Object.getOwnPropertyDescriptor;
  function field(input: object, name: keyof ExtensionShortcut): unknown {
    const entry = descriptor(input, name);
    if (entry && !('value' in entry)) throw new Error('Invalid shortcut registration.');
    return entry?.value;
  }
  return function captureShortcut(input: unknown): ExtensionShortcut {
    if (!input || typeof input !== 'object' || isProxy(input)) throw new Error('Invalid shortcut registration.');
    const key = field(input, 'key');
    const description = field(input, 'description');
    const command = field(input, 'command');
    const run = field(input, 'run');
    if (typeof key !== 'string' || !key.trim() || key.length > 128
      || description !== undefined && (typeof description !== 'string' || description.length > 512)
      || command !== undefined && (typeof command !== 'string' || !command.trim() || command.length > 64 || run !== undefined)
      || run !== undefined && (typeof run !== 'function' || isProxy(run))) throw new Error('Invalid shortcut registration.');
    return { key, ...(description === undefined ? {} : { description }), ...(command === undefined ? {} : { command }),
      ...(run === undefined ? {} : { run: run as NonNullable<ExtensionShortcut['run']> }) };
  };
}

export const captureShortcut = createShortcutCapture(types.isProxy);

export interface InstalledShortcut {
  readonly record: PackageRecord;
  readonly script: string;
  readonly command: string;
  readonly key: string;
}

interface ShortcutPackage {
  readonly record: PackageRecord;
  readonly grants: ReadonlySet<string>;
  readonly scripts: Map<string, ReadonlyMap<string, InstalledShortcut>>;
}

/** A worker can offer bindings only from a package this service actually registered. */
export class InstalledShortcuts {
  private readonly packages = new Map<string, ShortcutPackage>();
  private keys: ReadonlyMap<string, InstalledShortcut> | undefined;

  register(record: PackageRecord, root: string): void {
    const activation = record.activation[root];
    if (!activation?.enabled) return;
    this.packages.set(record.name, { record, grants: new Set(activation.grants), scripts: new Map() });
    this.keys = undefined;
  }

  retire(): void {
    this.packages.clear();
    this.keys = undefined;
  }

  publish(record: PackageRecord, script: string, result: ToolExecutionResult): void {
    const owner = this.packages.get(record.name);
    const metadata = result.metadata;
    if (!owner || owner.record.active.digest !== record.active.digest || !owner.grants.has(`script:${script}`)
      || !result.success || metadata?.cleanup !== 'confirmed' || !Array.isArray(metadata.registeredShortcuts)
      || !Array.isArray(metadata.registeredCommands)) return;
    const declared = new Set(record.active.manifest.commands.filter(entry => entry.script === script && owner.grants.has(`command:${entry.name}`)).map(entry => entry.name));
    const registered = new Set(metadata.registeredCommands.filter(isRecord).map(entry => entry.name));
    const previous = owner.scripts.get(script);
    const next = new Map<string, InstalledShortcut>();
    for (const entry of metadata.registeredShortcuts.slice(0, MAX_SHORTCUTS)) {
      if (!isRecord(entry) || typeof entry.key !== 'string' || typeof entry.command !== 'string'
        || !declared.has(entry.command) || !registered.has(entry.command)) continue;
      const key = normalizeKey(entry.key);
      if (!key) continue;
      const binding = previous?.get(key);
      next.set(key, binding?.command === entry.command ? binding : { record: owner.record, script, command: entry.command, key });
    }
    owner.scripts.set(script, next);
    this.keys = undefined;
  }

  find(key: string): InstalledShortcut | undefined {
    if (!this.keys) {
      const keys = new Map<string, InstalledShortcut>();
      for (const owner of this.packages.values()) {
        for (const { name } of owner.record.active.manifest.scripts) {
          for (const [key, binding] of owner.scripts.get(name) ?? []) keys.set(key, binding);
        }
      }
      this.keys = keys;
    }
    return this.keys.get(key);
  }
}
