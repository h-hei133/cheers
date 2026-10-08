import type { GoalRunOwner, GoalScheduling } from './run/model.js';

export type GoalPhase = 'active' | 'paused' | 'complete' | 'dropped';

export interface GoalWorkspace {
  readonly path: string;
  readonly identity: string;
}

export interface GoalScope {
  readonly sessionId: string;
  readonly sessionCreatedAt: string;
  readonly workspace: GoalWorkspace;
}

/** A declaration records the user's decision; it is not verified acceptance. */
export interface UserGoalCompletion {
  readonly source: 'user-declared';
  readonly timestamp: string;
  readonly declaration: '/goal complete';
}
export type GoalCompletion = UserGoalCompletion | import('./acceptance/model.js').VerifiedCompletion;

export interface SessionGoal extends GoalScope {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly revision: number;
  readonly objective: string;
  readonly phase: GoalPhase;
  readonly origin: 'user' | 'legacy-project';
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly runOwner: GoalRunOwner | null;
  readonly scheduling?: GoalScheduling;
  readonly pauseReason?: 'user' | 'session-reentry' | 'legacy-import';
  readonly completion?: GoalCompletion;
  /** Absent means no cumulative token cap; zero explicitly blocks admission. */
  readonly tokenBudget?: number;
}

export type GoalAction =
  | { readonly type: 'set'; readonly objective: string }
  | { readonly type: 'import'; readonly objective: string }
  | { readonly type: 'prepare'; readonly objective: string }
  | { readonly type: 'pause' | 'resume' | 'drop' | 'reentry' }
  | { readonly type: 'complete'; readonly source: 'user-declared' }
  | { readonly type: 'budget'; readonly cap?: number };

export type GoalWriteState = 'unchanged' | 'unknown' | 'persisted';

export class GoalWriteError extends Error {
  constructor(readonly code: 'invalid' | 'conflict' | 'unavailable' | 'write-failed' | 'verification-failed' | 'lock-failed',
    readonly state: GoalWriteState = 'unchanged') {
    super(`Goal update ${code}; persistence ${state}.`);
    this.name = 'GoalWriteError';
  }
}
