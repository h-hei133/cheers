import { randomUUID } from 'node:crypto';
import { sameValue } from '../../config/values.js';
import type { Session } from '../../session/schema/sessionRecord.js';
import type { ModelChoice } from '../../core/models/selection.js';
import { publishBoundSessionState, readBoundSessionState, type BoundSessionHost } from '../../session/store/bound.js';
import { decodeDirectors } from './codec.js';
import type { Director, DirectorState } from './model.js';

export class DirectorStore {
  constructor(private readonly manager: BoundSessionHost, private readonly session: Session) {}
  read(): DirectorState { const bound = readBoundSessionState(this.manager, this.session); return decodeDirectors(bound.state.directors, bound.scope); }
  enable(source: ModelChoice, worker: ModelChoice, directory: Director['directory']): Director {
    const bound = readBoundSessionState(this.manager, this.session);
    const row: Director = { id: randomUUID(), scope: bound.scope, directory, source, worker, createdAt: Date.now(), phase: 'enabled', workers: [],
      ...(bound.state.modelRevision ? { modelRevision: bound.state.modelRevision } : {}) };
    this.update(state => {
      if (state.cycles.some(cycle => !cycle.retired && cycle.phase !== 'disabled')) throw new Error('An unresolved director selection exists; use /director off first.');
      if (state.cycles.length >= 16) throw new Error('Director retention is full; previous records are preserved.');
      return { ...state, cycles: [...state.cycles, row] };
    }); return row;
  }
  change(expected: Director, change: Partial<Pick<Director, 'workers' | 'phase' | 'endedAt' | 'retired'>>): Director {
    let next = expected;
    this.update(state => {
      const current = state.cycles.find(row => row.id === expected.id);
      next = { ...expected, ...change };
      if (!sameValue(current, expected) || expected.phase === 'disabled' || expected.phase === 'unknown' && next.phase !== 'unknown'
        || expected.phase === 'stopping' && next.phase === 'enabled' || next.workers.length < expected.workers.length
        || expected.workers.some((id, i) => next.workers[i] !== id) || expected.endedAt !== undefined && next.endedAt !== expected.endedAt
        || expected.retired && next.retired !== true) throw new Error('The director changed or cannot be adopted.');
      return { ...state, cycles: state.cycles.map(row => row.id === expected.id ? next : row) };
    }); return next;
  }
  private update(change: (state: DirectorState) => DirectorState): void {
    const bound = readBoundSessionState(this.manager, this.session); const state = decodeDirectors(bound.state.directors, bound.scope);
    const next = { ...change(state), revision: state.revision + 1 }; decodeDirectors(next, bound.scope);
    publishBoundSessionState(this.manager, this.session, bound, (current, previous) => sameValue(current.directors, previous.directors),
      current => ({ ...current, directors: next }));
  }
}
