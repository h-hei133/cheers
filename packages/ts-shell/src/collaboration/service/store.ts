import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { withFileLock } from '../../session/store/sessionFileStore.js';
import { commitWorkspaceFile } from '../../edit/authority/commit.js';
import { inspectWorkspaceFile, pathIdentity } from '../../core/workspace/files.js';
import { STATE_BYTES, type ServiceState } from '../contract/model.js';
import { object, parseJson, requireValue } from '../contract/value.js';

/** One persisted transaction owns ACLs, fencing, frame cutover and mutation receipts. */
export class ServiceStore {
  readonly epoch = randomUUID();
  private readonly root: string;
  private readonly relative: string;
  private readonly ancestry: string;
  constructor(readonly target: string) {
    this.root = path.dirname(target); this.relative = path.basename(target); this.ancestry = pathIdentity(this.root);
    this.transaction(state => {
      state.epoch = this.epoch;
      for (const room of state.rooms) { room.epoch = this.epoch; room.aclRevision++; room.generation++; delete room.lease;
        for (const proposal of room.proposals) if (proposal.status === 'accepted' || proposal.status === 'dispatched') proposal.status = 'unknown'; }
      for (const receipt of state.receipts) if (receipt.status === 'intent') { receipt.status = 'unknown'; delete receipt.result; }
    }, true);
  }
  transaction<T>(action: (state: ServiceState) => T, startup = false): T {
    requireValue(pathIdentity(this.root) === this.ancestry, 'unavailable');
    return withFileLock(this.target + '.lock', () => {
      const baseline = inspectWorkspaceFile(this.root, this.relative, undefined, STATE_BYTES);
      let state: ServiceState = { version: 1, epoch: this.epoch, rooms: [], shares: [], receipts: [] };
      if (baseline.state === 'exists') {
        requireValue((baseline.mode & 0o077) === 0, 'denied');
        const saved = object(parseJson(baseline.content, STATE_BYTES, 65536));
        requireValue(saved.version === 1 && typeof saved.epoch === 'string' && Array.isArray(saved.rooms) && Array.isArray(saved.shares) && Array.isArray(saved.receipts), 'unavailable');
        requireValue(saved.rooms.length <= 64 && saved.shares.length <= 128 && saved.receipts.length <= 1024, 'unavailable');
        state = saved as unknown as ServiceState;
      }
      if (!startup) requireValue(state.epoch === this.epoch, 'stale');
      const result = action(state);
      const content = JSON.stringify(state) + '\n'; requireValue(Buffer.byteLength(content) <= STATE_BYTES, 'capacity');
      if (baseline.state === 'absent' || content !== baseline.content) {
        commitWorkspaceFile({ workspaceRoot: this.root, relativePath: this.relative, expected: baseline, content, mode: 0o600,
          assertFileAccess: () => requireValue(pathIdentity(this.root) === this.ancestry, 'unavailable') });
      }
      return result;
    }, { createParent: false });
  }
}
