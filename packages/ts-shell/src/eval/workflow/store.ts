import { randomUUID } from 'node:crypto';
import { sameValue } from '../../config/values.js';
import type { Session } from '../../session/schema/sessionRecord.js';
import { publishBoundSessionState, readBoundSessionState, type BoundSessionHost } from '../../session/store/bound.js';
import { decodeEvaluations } from './codec.js';
import type { Evaluation, EvaluationState, FrozenEvaluation } from './model.js';

export class EvaluationStore {
  constructor(readonly manager: BoundSessionHost, readonly session: Session) {}
  read(): EvaluationState {
    const bound = readBoundSessionState(this.manager, this.session);
    return decodeEvaluations(bound.state.evaluations, bound.scope, bound.layout.sessionDir);
  }
  create(frozen: FrozenEvaluation): Evaluation {
    const scope = readBoundSessionState(this.manager, this.session).scope;
    const row: Evaluation = { id: randomUUID(), scope, frozen, phase: 'creating', rounds: [] };
    this.update(state => {
      if (state.runs.some(row => ['creating', 'active', 'unknown'].includes(row.phase)) || state.runs.length >= 8)
        throw new Error('Evaluation is unresolved or retention is full. Inspect /improve status and retain it explicitly.');
      return { ...state, runs: [...state.runs, row] };
    }); return row;
  }
  change(expected: Evaluation, change: Partial<Pick<Evaluation, 'phase' | 'directory' | 'rounds' | 'operationId'>>): Evaluation {
    const next = { ...expected, ...change };
    this.update(state => {
      if (!sameValue(state.runs.find(row => row.id === expected.id), expected) || ['retained', 'published'].includes(expected.phase)
        || expected.phase === 'unknown' && next.phase !== 'retained' || expected.directory && !sameValue(expected.directory, next.directory)
        || next.rounds.length < expected.rounds.length || next.rounds.length > expected.rounds.length + 1
        || expected.rounds.some((round, i) => round.status !== 'running' && !sameValue(round, next.rounds[i]))) throw new Error('Evaluation state changed or cannot be adopted.');
      return { ...state, runs: state.runs.map(row => row.id === expected.id ? next : row) };
    }); return next;
  }
  private update(change: (state: EvaluationState) => EvaluationState): void {
    const bound = readBoundSessionState(this.manager, this.session);
    const previous = decodeEvaluations(bound.state.evaluations, bound.scope, bound.layout.sessionDir);
    const next = { ...change(previous), revision: previous.revision + 1 }; decodeEvaluations(next, bound.scope, bound.layout.sessionDir);
    publishBoundSessionState(this.manager, this.session, bound, (current, previous) => sameValue(current.evaluations, previous.evaluations),
      current => ({ ...current, evaluations: next }));
  }
}
