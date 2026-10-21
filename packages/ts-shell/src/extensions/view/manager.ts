import type { ExtensionService } from '../service.js';
import { rootSignature } from '../lifecycle/grants.js';
import { activationOperation } from '../lifecycle/grants.js';
import { installOperation, parseSpec, removeOperation, rollbackOperation, type Operation } from '../lifecycle/install.js';
import { readSources, sourceFile } from '../registry/sources.js';
import { observeDirectory } from '../../core/state/watch.js';
import { freezeDeep } from '../../core/values/freeze.js';
import type { ExtensionSource } from '../model.js';
import type { ExtensionInspection, ExtensionManager, ExtensionPreparation, ExtensionSelection } from './model.js';
import { installTarget, packageActions } from './actions.js';
import { inspectionVersion, packageKey, projectExtensions } from './projection.js';
import { safeLines } from './text.js';

export type ExtensionRun = <T>(operation: (signal: AbortSignal) => Promise<T>) => Promise<T>;
const changed = 'Extension state, source trust or binding changed. Reopen /plugin before acting.';

/** A view of the existing service; all writers and approvals remain lifecycle operations. */
export function extensionManager(service: ExtensionService, admission: () => string | undefined, run: ExtensionRun): ExtensionManager {
  const observe = () => {
    if (admission()) throw new Error(changed);
    service.check();
    const state = service.store.read();
    let sources: ExtensionSource[] | undefined;
    try { sources = readSources(); } catch { /* Preserve packages while source availability is unknown. */ }
    const workspace = rootSignature(service.root); const offline = service.offline();
    const errors = [...service.errors];
    const outcomes = service.store.outcomes.filter(entry => entry.durability === 'unknown').map(entry => entry.detail);
    const version = inspectionVersion({ state, sources: sources ?? null, workspace, offline, errors, outcomes });
    return { state, sources, workspace, version, errors, outcomes, offline };
  };
  const read = (): ExtensionInspection => {
    try {
      if (admission()) return { state: 'stale' };
      const value = observe();
      return { state: 'ready', snapshot: freezeDeep(projectExtensions(value.state, value.sources, service.root,
        value.workspace, value.version, value.errors, value.outcomes, value.offline)) };
    } catch { return { state: 'unavailable' }; }
  };
  const check = (version: string) => {
    const value = observe();
    if (value.version !== version || value.outcomes.length) throw new Error(changed);
    return value;
  };
  return { read, subscribe: listener => {
    let released = false, previous = '';
    const publish = () => {
      if (released) return;
      const inspection = read();
      const version = inspection.state === 'ready' ? inspection.snapshot.version : inspection.state;
      if (version === previous) return;
      previous = version;
      try { listener(inspection); } catch { /* A view cannot alter the owner. */ }
    };
    const releases = [service.store.file, sourceFile()].map(file => observeDirectory(file, publish));
    const timer = setInterval(publish, 1000); timer.unref?.();
    publish();
    return () => { if (released) return; released = true; clearInterval(timer); releases.forEach(release => release()); };
  }, prepare: (version, selection) => run(async signal => {
    signal.throwIfAborted();
    const value = check(version);
    const record = value.state.packages.find(entry => packageKey(entry.name) === selection.item);
    const targets = selection.item === undefined ? [installTarget] : record ? packageActions(record, service.root, value.workspace) : [];
    const target = targets.find(entry => entry.view.id === selection.action);
    if (!target || Boolean(target.view.input) !== (selection.input !== undefined)) throw new Error('Select one offered extension action.');
    const operation = await prepareOperation(service, target.args, selection, signal);
    signal.throwIfAborted(); check(version);
    let used = false;
    const prepared: ExtensionPreparation = { title: target.view.label, preview: safeLines(operation.preview), apply: async () => {
      if (used) return 'Extension confirmation has already been consumed.';
      used = true;
      return run(async signal => {
        signal.throwIfAborted(); check(version);
        const guarded: Operation = { preview: operation.preview, apply: async context => {
          signal.throwIfAborted(); check(version);
          return operation.apply(context);
        } };
        const selected = ['enable', 'disable', 'grant', 'revoke'].includes(target.args[0]!) ? 'extension_grant' : 'extension_manage';
        return safeLines(await service.approve(guarded, selected, signal)).join('\n');
      });
    } };
    return prepared;
  }) };
}

async function prepareOperation(service: ExtensionService, args: readonly string[], selection: ExtensionSelection, signal: AbortSignal): Promise<Operation> {
  const [action, name, input] = args;
  if (action === 'install' || action === 'update') {
    const spec = selection.input!; const parsed = parseSpec(spec);
    if (action === 'update' && parsed.name !== name) throw new Error('Update release must match the selected package.');
    return installOperation(service, spec, action === 'update' ? name : undefined, signal);
  }
  if (action === 'uninstall') return removeOperation(service, name!);
  if (action === 'rollback') return rollbackOperation(service, name!, input!);
  return activationOperation(service, service.root, action as 'enable' | 'disable' | 'grant' | 'revoke', name!, input);
}
