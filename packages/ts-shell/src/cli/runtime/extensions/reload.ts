import type { ShellRuntimeContext } from '../../../core/shell/runtimeContext.js';
import type { ShellSessionRuntime } from '../../../core/shell/sessionRuntime.js';
import { configurationAdmission } from '../../../core/shell/configuration.js';
import { extensionHostFor } from './host.js';
import { prepareSessionSurface } from '../session/surface.js';

export type ExtensionReloadResult = { readonly status: 'reloaded'; readonly diagnostics: readonly string[] }
  | { readonly status: 'partial'; readonly diagnostics: readonly string[] }
  | { readonly status: 'refused' | 'unknown'; readonly reason: string };

interface ReloadOwner {
  readonly current: () => boolean;
  readonly ready: () => Promise<void>;
  readonly shutdown: (signal: AbortSignal) => Promise<void>;
  readonly retire: () => Promise<void>;
  readonly replace: (signal: AbortSignal) => Promise<void>;
  readonly start: (signal: AbortSignal) => Promise<void>;
  readonly diagnostics: () => readonly string[];
}

/** An explicit reload joins the existing resource owners while preserving the active session. */
export function createExtensionReload(context: ShellRuntimeContext, runtime: ShellSessionRuntime, owner: ReloadOwner): (signal?: AbortSignal) => Promise<ExtensionReloadResult> {
  let pending: Promise<ExtensionReloadResult> | undefined;
  return signal => {
    if (pending) return pending;
    if (signal?.aborted) return Promise.resolve({ status: 'refused', reason: 'Extension reload cancelled before retirement.' });
    if (runtime.isRunning()) return Promise.resolve({ status: 'refused', reason: 'A session operation is still running.' });
    const task = prepareReload(context, owner);
    const run = runtime.commands.run(token => task(token), 'extension-reload', signal);
    pending = run.finally(() => { pending = undefined; });
    return pending;
  };
}

function prepareReload(context: ShellRuntimeContext, owner: ReloadOwner): (signal: AbortSignal) => Promise<ExtensionReloadResult> {
  const session = context.session, id = session.id, createdAt = session.createdAt, sessionRoot = session.projectRoot;
  const cwd = context.cwd, root = context.projectRoot, configuration = context.configuration, revision = configuration.current;
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
      signal.throwIfAborted();
    };
    try {
      check(); await owner.ready(); check();
      quiesced = true;
      await owner.shutdown(signal); check();
      retirement = Promise.resolve().then(owner.retire);
      await retirement; check();
      retirement = undefined;
      await owner.replace(signal);
      host = extensionHostFor(context); check();
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
