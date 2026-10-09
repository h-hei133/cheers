import path from 'node:path';
import { observeDirectory } from '../state/watch.js';
import type { SubagentDefinition } from './types.js';
import { SubagentLoader } from './subagentLoader.js';

interface ActiveRole { readonly check: () => string | undefined; readonly controller: AbortController; readonly done: Promise<void> }
const active = new Set<ActiveRole>();
/** Capture fresh identity and abort on replacement; synchronous fences cover missed watch events. */
export function bindRole(loader: SubagentLoader, name: string, selected: SubagentDefinition | undefined, trusted: () => boolean, parent?: AbortSignal) {
  const controller = new AbortController(); let refusal: string | undefined;
  const check = () => {
    if (refusal) return refusal;
    const discovery = loader.discover(trusted()); const current = discovery.effective.get(name.toLowerCase());
    if (discovery.diagnostics.some(note => /unreadable|limit reached|unsafe path/.test(note))
      || current?.definition?.enabled === false || current && !current.definition || current?.definition?.identity !== selected?.identity) {
      refusal = 'Agent definition changed, is disabled or is invalid; start a fresh task.'; controller.abort();
    }
    return refusal;
  };
  const abort = () => controller.abort(parent?.reason); parent?.addEventListener('abort', abort, { once: true }); if (parent?.aborted) abort();
  const watch = () => { check(); };
  const directories = new Set([...loader.directories(), ...(selected?.filePath ? [path.dirname(selected.filePath)] : [])]);
  const close = [...directories].map(directory => observeDirectory(directory, watch));
  const timer = setInterval(watch, 100); timer.unref();
  let resolveDone!: () => void; const done = new Promise<void>(resolve => { resolveDone = resolve; });
  const record = { check, controller, done }; active.add(record);
  return { signal: controller.signal, admission: check, close: () => {
    clearInterval(timer); close.forEach(stop => stop()); parent?.removeEventListener('abort', abort); active.delete(record); resolveDone();
  } };
}
/** Revoke changed identities immediately, then bound the wait for native owners. */
export async function revokeChangedRoles(): Promise<string> {
  const changed = [...active].filter(record => record.check());
  if (!changed.length) return 'No affected live role.';
  let timer: ReturnType<typeof setTimeout> | undefined;
  const drained = await Promise.race([Promise.all(changed.map(record => record.done)).then(() => true), new Promise<false>(resolve => { timer = setTimeout(() => resolve(false), 3000); })]);
  if (timer) clearTimeout(timer);
  return drained ? 'Affected live roles stopped.' : 'Cancellation requested; affected native cleanup remains unverified after three seconds.';
}
