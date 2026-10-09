import { sameValue } from '../../../config/values.js';
import type { Session } from '../../../session/schema/sessionRecord.js';
import { readBoundSessionState, publishBoundSessionState, type BoundSessionHost } from '../../../session/store/bound.js';
import type { GitOperationResult } from './model.js';
import type { CheckoutIdentity } from '../worktree/identity.js';

export interface GitRecord { readonly id: string; readonly root: string; readonly summary: string; readonly result: GitOperationResult;
  readonly remote?: { readonly url: string; readonly ref: string; readonly desired: string; readonly before?: string | null } }
export interface GitWorkflowState { readonly version: 1; readonly operations: readonly GitRecord[]; readonly worktrees: readonly ({ path: string; branch: string; head: string } & CheckoutIdentity)[] }
export interface GitStore { read(): GitWorkflowState; write(update: (state: GitWorkflowState) => GitWorkflowState): void }
export function gitStore(host: BoundSessionHost, current: () => Session): GitStore {
  const decode = (value: unknown): GitWorkflowState => {
    if (value === undefined) return { version: 1, operations: [], worktrees: [] };
    const state = value as GitWorkflowState;
    if (state?.version !== 1 || !Array.isArray(state.operations) || !Array.isArray(state.worktrees)) throw new Error('Git workflow state is unavailable.');
    return state;
  };
  return { read: () => decode(readBoundSessionState(host, current()).state.gitWorkflow), write: update => {
    const session = current(); const baseline = readBoundSessionState(host, session);
    publishBoundSessionState(host, session, baseline, (state, previous) => sameValue(state.gitWorkflow, previous.gitWorkflow), state => ({ ...state, gitWorkflow: update(decode(state.gitWorkflow)) }));
  } };
}
export function retainGitRecord(store: GitStore, record: GitRecord): void {
  store.write(state => ({ ...state, operations: [...state.operations.filter(item => item.id !== record.id), record] }));
}
