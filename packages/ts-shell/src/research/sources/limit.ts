import path from 'node:path';
import { existsSync } from 'node:fs';
import { createSessionStoreLayout } from '../../session/store/sessionFileLayout.js';
import { readJsonFileWithRetry, withFileLock, writeJsonFileAtomic } from '../../session/store/sessionFileStore.js';
import { createProcessOwner, processOwnerDisposition, type ProcessOwner } from '../../core/state/owner.js';
import type { RequestScope } from '../../core/network/request.js';
import { NetworkError } from '../../core/network/error.js';

interface RateState { readonly schemaVersion: 1; readonly nextAt: number; readonly owner?: ProcessOwner }

export async function waitSource(ms: number, scope: RequestScope): Promise<void> {
  scope.check();
  let cancelled: () => void;
  let timer: ReturnType<typeof setTimeout>;
  await new Promise<void>((resolve, reject) => {
    cancelled = (): void => { clearTimeout(timer); reject(scope.signal.reason); };
    timer = setTimeout(resolve, Math.max(1, ms));
    scope.signal.addEventListener('abort', cancelled, { once: true });
    if (scope.signal.aborted) cancelled();
  }).finally(() => { clearTimeout(timer); scope.signal.removeEventListener('abort', cancelled); });
  scope.check();
}

/** One durable claim spans the complete request and body read, across this runtime home. */
export async function limitedSource<T>(provider: string, spacingMs: number, scope: RequestScope, action: () => Promise<T>,
  directory = path.dirname(createSessionStoreLayout().sessionsDir)): Promise<T> {
  const file = path.join(directory, `source-${provider}.json`);
  const owner = createProcessOwner();
  let acquired = false;
  while (!acquired) {
    scope.check();
    let delay = 100;
    try {
      acquired = withFileLock(`${file}.lock`, () => {
        const state = rateState(file);
        if (state.owner && processOwnerDisposition(state.owner) !== 'dead') return false;
        if (state.owner) { writeJsonFileAtomic(file, { schemaVersion: 1, nextAt: Date.now() + spacingMs }); return false; }
        delay = Math.max(1, state.nextAt - Date.now());
        if (state.nextAt > Date.now()) return false;
        writeJsonFileAtomic(file, { schemaVersion: 1, nextAt: state.nextAt, owner });
        return true;
      }, { recovery: 'local-dead' });
    } catch { throw new NetworkError('network_error'); }
    if (!acquired) await waitSource(Math.min(delay, 250), scope);
  }
  try { scope.check(); return await action(); }
  finally {
    try {
      withFileLock(`${file}.lock`, () => {
        const state = rateState(file);
        if (state.owner?.token !== owner.token) throw new Error('Source limiter ownership changed.');
        writeJsonFileAtomic(file, { schemaVersion: 1, nextAt: Date.now() + spacingMs });
      }, { recovery: 'local-dead', createParent: false });
    } catch { throw new NetworkError('network_error'); }
  }
}

function rateState(file: string): RateState {
  const value = readJsonFileWithRetry<RateState>(file, { required: existsSync(file), parseErrorDetail: 'Source admission state is invalid.' });
  if (value === undefined) return { schemaVersion: 1, nextAt: 0 };
  if (value.schemaVersion !== 1 || !Number.isSafeInteger(value.nextAt) || value.nextAt < 0
    || value.owner && (!Number.isSafeInteger(value.owner.pid) || value.owner.pid < 1 || typeof value.owner.token !== 'string'
      || typeof value.owner.hostname !== 'string' || typeof value.owner.startedAt !== 'string')) throw new Error('Source admission state is invalid.');
  return value;
}
