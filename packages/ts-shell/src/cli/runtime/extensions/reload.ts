import type { ShellRuntimeContext } from '../../../core/shell/runtimeContext.js';
import type { ShellSessionRuntime } from '../../../core/shell/sessionRuntime.js';
import { configurationAdmission } from '../../../core/shell/configuration.js';
import { extensionHostFor } from './host.js';
import { prepareSessionSurface } from '../session/surface.js';
import type { ExtensionHostBridge } from '../../../extensions/runtime/inProcessLoader.js';
import type { ConfigPublication } from '../../../config/state.js';

export type ExtensionReloadResult<Diagnostic = string> = { readonly status: 'reloaded'; readonly diagnostics: readonly Diagnostic[] }
  | { readonly status: 'partial'; readonly diagnostics: readonly Diagnostic[] }
  | { readonly status: 'refused' | 'unknown'; readonly reason: string };

interface ReloadOwner<Diagnostic> {
  readonly current: () => boolean;
  readonly admission?: () => void;
  readonly ready: () => Promise<void>;
  readonly shutdown: (signal: AbortSignal) => Promise<void>;
  readonly retire: () => Promise<void>;
  readonly replace: (signal: AbortSignal) => Promise<void | { readonly host: ExtensionHostBridge; readonly publication?: ConfigPublication }>;
  readonly start: (signal: AbortSignal) => Promise<void>;
  readonly diagnostics: () => readonly Diagnostic[];
}

/** An explicit reload joins the existing resource owners while preserving the active session. */
export function createExtensionReload<Diagnostic = string>(context: ShellRuntimeContext, runtime: ShellSessionRuntime,
  supplied: ReloadOwner<Diagnostic> | (() => ReloadOwner<Diagnostic>)): (signal?: AbortSignal) => Promise<ExtensionReloadResult<Diagnostic>> {
  let pending: Promise<ExtensionReloadResult<Diagnostic>> | undefined;
  return signal => {
    if (pending) return pending;
    if (signal?.aborted) return Promise.resolve({ status: 'refused', reason: 'Extension reload cancelled before retirement.' });
    if (runtime.isRunning()) return Promise.resolve({ status: 'refused', reason: 'A session operation is still running.' });
    const session = context.session, id = session.id, createdAt = session.createdAt, projectRoot = session.projectRoot;
    const cwd = context.cwd, root = context.projectRoot, configuration = context.configuration, revision = configuration.current, host = extensionHostFor(context);
    let task: (signal: AbortSignal) => Promise<ExtensionReloadResult<Diagnostic>>;
    try {
      const owner = typeof supplied === 'function' ? supplied() : supplied;
      if (context.session !== session || session.id !== id || session.createdAt !== createdAt || session.projectRoot !== projectRoot
        || context.cwd !== cwd || context.projectRoot !== root || context.configuration !== configuration
        || configuration.current !== revision || extensionHostFor(context) !== host) throw new Error('Extension reload source changed during capture.');
      task = prepareReload(context, owner);
    }
    catch { return Promise.resolve({ status: 'refused', reason: 'Extension reload ownership could not be verified.' }); }
    if (runtime.isRunning()) return Promise.resolve({status:'refused', reason:'A session operation is still running.'});
    const run = runtime.commands.run(token => task(token), 'extension-reload', signal);
    pending = run.finally(() => { pending = undefined; });
    return pending;
  };
}

function prepareReload<Diagnostic>(context: ShellRuntimeContext, owner: ReloadOwner<Diagnostic>): (signal: AbortSignal) => Promise<ExtensionReloadResult<Diagnostic>> {
  const session = context.session, id = session.id, createdAt = session.createdAt, sessionRoot = session.projectRoot;
  const cwd = context.cwd, root = context.projectRoot, configuration = context.configuration;
  let revision = configuration.current;
  const configured = configurationAdmission(context);
  let host = extensionHostFor(context), quiesced = false;
  let retirement: Promise<void> | undefined;
  const sourceCurrent = () => context.session === session && session.id === id && session.createdAt === createdAt && session.projectRoot === sessionRoot
    && context.cwd === cwd && context.projectRoot === root && context.configuration === configuration && configuration.current === revision;
  return async signal => {
    const check = () => {
      signal.throwIfAborted();
      const refused = configured();
      if (refused || !owner.current() || !sourceCurrent() || extensionHostFor(context) !== host) throw new Error(refused ?? 'Extension reload owner changed.');
      owner.admission?.();
      signal.throwIfAborted();
    };
    try {
      check(); await owner.ready(); check();
      quiesced = true;
      await owner.shutdown(signal); check();
      retirement = Promise.resolve().then(owner.retire);
      await retirement; check();
      retirement = undefined;
      const adopted = await owner.replace(signal);
      if (adopted) {
        host = adopted.host;
        if (adopted.publication) revision = adopted.publication;
      } else host = extensionHostFor(context);
      check();
      prepareSessionSurface(context); check();
      await owner.start(signal); check();
      const diagnostics = [...owner.diagnostics()]; check();
      return diagnostics.length ? { status: 'partial', diagnostics } : { status: 'reloaded', diagnostics };
    } catch (error) {
      if (quiesced) {
        retirement ??= Promise.resolve().then(owner.retire);
        await retirement.catch(() => {});
        if (owner.current()) context.workspaceIssue = 'Extension reload was not verified. Restart before continuing.';
        return { status: 'unknown', reason: 'Extension reload was not verified. Restart before continuing.' };
      }
      return { status: 'refused', reason: signal.aborted ? 'Extension reload cancelled before retirement.' : error instanceof Error ? error.message : 'Extension reload could not be admitted.' };
    }
  };
}
