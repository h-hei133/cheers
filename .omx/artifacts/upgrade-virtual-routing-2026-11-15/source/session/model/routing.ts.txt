import { snapshotData } from '../../core/values/data.js';
import { captureBranchStore } from '../branch/store/index.js';

/** One branch-state key, captured before calling extension code and committed by the request owner. */
export function captureRoutingState(input: { readonly sessionId: string; readonly cwd: string;
  readonly provider: string; readonly modelId: string; readonly admission?: () => void }) {
  const { sessionId, cwd, provider, modelId, admission } = input;
  const key = JSON.stringify([provider, modelId]);
  const store = captureBranchStore({ sessionId, cwd, namespace: 'model-routing', admission });
  const initial = store.initial[key];
  const state = initial === undefined ? undefined : snapshotData(JSON.parse(initial),
    { bytes: 256 * 1024, nodes: 10_000, depth: 24 });
  let accepted = false;
  return Object.freeze({ state, accept: (next: unknown, admit: () => void) => {
    if (accepted) { admission?.(); admit(); return; }
    const captured = next === undefined ? undefined : snapshotData(next, { bytes: 256 * 1024, nodes: 10_000, depth: 24 });
    // Even an absent/unchanged result writes the read key: this is one atomic CAS,
    // including tombstones. A separate read check and empty commit would race.
    store.commit({ [key]: captured === undefined ? initial ?? null : JSON.stringify(captured) }, admit);
    accepted = true;
  } });
}
