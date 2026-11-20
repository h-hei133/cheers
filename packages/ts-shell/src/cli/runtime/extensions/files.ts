import fs from 'node:fs';
import path from 'node:path';
import { loadInProcessExtensionAsync, type ExtensionFlag, type ExtensionHostBridge, type LoadedInProcessExtension } from '../../../extensions/runtime/inProcessLoader.js';
import { ExtensionThinkingError } from '../../../extensions/runtime/model.js';
import { installedOptions, type InstalledOptionValue } from '../../../extensions/runtime/options.js';
import type { DenyRule } from '../../../core/shell/approval/deny.js';
import { assertExtensionOption, ExtensionOptionError, type CliExtensionArguments, type ExtensionOptionDeclaration } from '../../options/extensions.js';

interface ExtensionFilesInput {
  readonly paths: readonly string[];
  readonly baseDir: string;
  readonly root: string;
  readonly assertEntryAccess: (absolute: string) => void;
  readonly denyRules: () => readonly DenyRule[];
  readonly signal: AbortSignal;
  readonly host: ExtensionHostBridge;
  readonly cliArguments?: CliExtensionArguments;
}

type SourceAccess = Pick<ExtensionFilesInput, 'assertEntryAccess' | 'denyRules'>;

export interface PreparedExtensionFiles {
  readonly check: () => void;
  readonly installedValues: readonly InstalledOptionValue[];
  readonly retire: () => void;
  readonly bind: (input: SourceAccess & { readonly host: ExtensionHostBridge; readonly signal: AbortSignal }) => readonly LoadedInProcessExtension[];
}

/** Before activation, extension code has only its admitted workspace reads. */
export async function prepareExtensionFiles(input: Omit<ExtensionFilesInput, 'signal' | 'host'> & {
  readonly inspect: Pick<ExtensionHostBridge, 'getActiveTools' | 'getAllTools' | 'getCommands'>;
}): Promise<PreparedExtensionFiles> {
  const retirement = new AbortController();
  let access: SourceAccess = input;
  let active: ExtensionHostBridge | undefined;
  const host: ExtensionHostBridge = {
    get ui() { return active?.ui; },
    getAllTools: () => (active ?? input.inspect).getAllTools?.() ?? [],
    getActiveTools: () => (active ?? input.inspect).getActiveTools?.() ?? [],
    getCommands: () => (active ?? input.inspect).getCommands?.() ?? [],
    setThinkingLevel: (level, signal) => {
      const host = requireActive(active);
      if (!host.setThinkingLevel) throw new ExtensionThinkingError('Session thinking level is unavailable from this host.');
      return host.setThinkingLevel(level, signal);
    },
    sendMessage: async message => { await requireActive(active).sendMessage?.(message); },
    appendEntry: async (type, data) => { await requireActive(active).appendEntry?.(type, data); },
  };
  const retire = () => { active = undefined; retirement.abort(); };
  try {
    const loaded = await loadExtensionFiles({ ...input, signal: retirement.signal, host,
      assertEntryAccess: value => access.assertEntryAccess(value), denyRules: () => access.denyRules() });
    return { check: loaded.check, installedValues: loaded.installedValues, retire, bind: next => {
      retirement.signal.throwIfAborted();
      next.signal.throwIfAborted();
      if (active) throw new Error('Startup extension instances have already been bound.');
      access = next;
      try {
        loaded.check();
        active = next.host;
        next.signal.addEventListener('abort', retire, { once: true });
        return loaded.extensions;
      } catch (error) { retire(); throw error; }
    } };
  } catch (error) { retire(); throw error; }
}

function requireActive(host?: ExtensionHostBridge): ExtensionHostBridge {
  if (!host) throw new Error('Extension startup arguments have not been admitted.');
  return host;
}

/** A flag declaration and its loaded instance share one admitted source. */
export async function loadExtensionFiles(input: ExtensionFilesInput) {
  const extensions: LoadedInProcessExtension[] = [];
  const checks: Array<() => void> = [];
  const flags = new Map<string, ExtensionOptionDeclaration>();
  let flagError: { readonly cause: unknown } | undefined;
  const installedValues: InstalledOptionValue[] = [];
  const check = () => {
    input.signal.throwIfAborted();
    checks.forEach(assertSource => assertSource());
  };
  if (input.cliArguments) {
    try {
      for (const option of installedOptions(input.root)) {
        assertExtensionOption(option.flag);
        if (flags.has(option.flag.name)) throw new ExtensionOptionError(`Extension option --${option.flag.name} is declared more than once.`);
        flags.set(option.flag.name, option);
        const value = input.cliArguments.value(option);
        if (value !== undefined) {
          installedValues.push(Object.freeze({ option, value }));
          checks.push(option.check);
        }
      }
    } catch (error) {
      if (error instanceof ExtensionOptionError) throw error;
      throw new ExtensionOptionError('Installed extension options could not be verified.');
    }
  }
  for (const rawPath of input.paths) {
    const filePath = resolveEntry(path.resolve(input.baseDir, rawPath));
    input.assertEntryAccess(filePath);
    const canonical = fs.realpathSync.native(filePath);
    input.assertEntryAccess(canonical);
    const version = entryVersion(canonical);
    const assertSource = () => {
      input.assertEntryAccess(filePath);
      input.assertEntryAccess(canonical);
      if (fs.realpathSync.native(filePath) !== canonical || entryVersion(canonical) !== version) {
        throw new ExtensionOptionError('An extension source changed during initialization.');
      }
    };
    checks.push(assertSource);
    const source = Object.freeze({ entry: filePath, canonical });
    const flagValue = (flag: ExtensionFlag) => {
      try {
        assertExtensionOption(flag);
        if (flags.has(flag.name)) throw new ExtensionOptionError(`Extension option --${flag.name} is declared more than once.`);
        const declaration = Object.freeze({ flag, source });
        flags.set(flag.name, declaration);
        return input.cliArguments?.value(declaration);
      } catch (cause) { flagError ??= { cause }; throw cause; }
    };
    extensions.push(await loadInProcessExtensionAsync({ filePath: canonical, workspaceRoot: input.root,
      denyRules: input.denyRules, signal: input.signal, host: input.host, flagValue }));
    if (flagError) throw flagError.cause;
    assertSource();
  }
  check();
  input.cliArguments?.validate([...flags.values()]);
  return { extensions: Object.freeze(extensions), check, installedValues: Object.freeze(installedValues) };
}

function resolveEntry(candidate: string): string {
  if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
    for (const name of ['index.ts', 'index.mts', 'index.mjs', 'index.js']) {
      const entry = path.join(candidate, name);
      if (fs.existsSync(entry)) return entry;
    }
  }
  return candidate;
}

function entryVersion(file: string): string {
  const stat = fs.lstatSync(file);
  if (!stat.isFile()) throw new ExtensionOptionError('The extension entry is not a regular file.');
  return `${stat.dev}:${stat.ino}:${stat.mode}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;
}
