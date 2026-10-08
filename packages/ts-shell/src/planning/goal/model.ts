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
export interface GoalCompletion {
  readonly source: 'user-declared';
  readonly timestamp: string;
  readonly declaration: '/goal complete';
}

export interface SessionGoal extends GoalScope {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly revision: number;
  readonly objective: string;
  readonly phase: GoalPhase;
  readonly origin: 'user' | 'legacy-project';
  readonly createdAt: string;
  readonly updatedAt: string;
  /** Scheduling is not connected by the entity/state batch. */
  readonly runOwner: null;
  readonly pauseReason?: 'user' | 'session-reentry' | 'legacy-import';
  readonly completion?: GoalCompletion;
}

export type GoalAction =
  | { readonly type: 'set'; readonly objective: string }
  | { readonly type: 'import'; readonly objective: string }
  | { readonly type: 'pause' | 'resume' | 'drop' | 'reentry' }
  | { readonly type: 'complete'; readonly source: 'user-declared' };

export type GoalWriteState = 'unchanged' | 'unknown' | 'persisted';

export class GoalWriteError extends Error {
  constructor(readonly code: 'invalid' | 'conflict' | 'unavailable' | 'write-failed' | 'verification-failed' | 'lock-failed',
    readonly state: GoalWriteState = 'unchanged') {
    super(`Goal update ${code}; persistence ${state}.`);
    this.name = 'GoalWriteError';
  }
}
