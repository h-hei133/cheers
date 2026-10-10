import { randomUUID } from 'node:crypto';
import { sameValue } from '../../config/values.js';
import type { Session } from '../../session/schema/sessionRecord.js';
import { publishBoundSessionState, readBoundSessionState, type BoundSessionHost } from '../../session/store/bound.js';
import { decodeHandoffs } from './codec.js';
import type { Handoff, HandoffState, ModelChoice } from './model.js';

export class HandoffStore {
  constructor(private readonly manager: BoundSessionHost, private readonly session: Session) {}
  read(): HandoffState { const bound = readBoundSessionState(this.manager, this.session); return decodeHandoffs(bound.state.handoffs, bound.scope); }
  arm(source: ModelChoice, target: ModelChoice, directory: Handoff['directory']): Handoff {
    const bound = readBoundSessionState(this.manager, this.session);
    const row: Handoff = { id: randomUUID(), scope: bound.scope, directory, source, target, createdAt: Date.now(),
      phase: 'armed', ...(bound.state.modelRevision ? { modelRevision: bound.state.modelRevision } : {}) };
    this.update(state => {
      if (state.cycles.some(cycle => !cycle.retired && ['armed', 'running', 'switched', 'unknown'].includes(cycle.phase))) throw new Error('An unresolved handoff already exists. Cancel its pending selection explicitly first.');
      if (state.cycles.length >= 16) throw new Error('Handoff retention is full; existing history is preserved.');
      return { ...state, cycles: [...state.cycles, row] };
    }); return row;
  }
  change(expected: Handoff, update: Partial<Pick<Handoff, 'phase' | 'runId' | 'promptEntryId' | 'switchedBy' | 'endedAt' | 'retired'>>): Handoff {
    let changed = expected;
    this.update(state => {
      const current = state.cycles.find(row => row.id === expected.id);
      if (!sameValue(current, expected) || (current?.runId && 'runId' in update && update.runId !== current.runId)
        || (current?.switchedBy && 'switchedBy' in update && update.switchedBy !== current.switchedBy)
        || (current?.runId && update.phase === 'armed') || !transition(expected.phase, update.phase ?? expected.phase)
        || (current?.endedAt !== undefined && 'endedAt' in update && update.endedAt !== current.endedAt)
        || (current?.retired && update.retired !== true)) throw new Error('The handoff changed or cannot replay.');
      changed = { ...expected, ...update };
      return { ...state, cycles: state.cycles.map(row => row.id === expected.id ? changed : row) };
    }); return changed;
  }
  private update(change: (state: HandoffState) => HandoffState): void {
    const bound = readBoundSessionState(this.manager, this.session); const state = decodeHandoffs(bound.state.handoffs, bound.scope);
    const next = { ...change(state), revision: state.revision + 1 };
    decodeHandoffs(next, bound.scope);
    publishBoundSessionState(this.manager, this.session, bound, (current, previous) => sameValue(current.handoffs, previous.handoffs),
      current => ({ ...current, handoffs: next }));
  }
}

function transition(before: Handoff['phase'], after: Handoff['phase']): boolean {
  if (before === 'armed') return ['running', 'cancelled', 'failed', 'unknown'].includes(after);
  if (before === 'running') return ['switched', 'completed', 'failed', 'cancelled', 'unknown'].includes(after);
  if (before === 'switched') return ['completed', 'failed', 'cancelled', 'unknown'].includes(after);
  return before === 'unknown' && after === 'unknown';
}
