import fs from 'node:fs';
import path from 'node:path';
import { loadInProcessExtensionAsync, type ExtensionFlag, type ExtensionHostBridge, type LoadedInProcessExtension } from '../../../extensions/runtime/inProcessLoader.js';
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
    sendMessage: async message => { await requireActive(active).sendMessage?.(message); },
    appendEntry: async (type, data) => { await requireActive(active).appendEntry?.(type, data); },
  };
  const retire = () => { active = undefined; retirement.abort(); };
  try {
    const loaded = await loadExtensionFiles({ ...input, signal: retirement.signal, host,
      assertEntryAccess: value => access.assertEntryAccess(value), denyRules: () => access.denyRules() });
    return { check: loaded.check, retire, bind: next => {
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
  const check = () => {
    input.signal.throwIfAborted();
    checks.forEach(assertSource => assertSource());
  };
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
  return { extensions: Object.freeze(extensions), check };
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
