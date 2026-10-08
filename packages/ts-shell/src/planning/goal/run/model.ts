export interface GoalRunOwner {
  readonly token: string;
  readonly pid: number;
  readonly hostname: string;
  readonly startedAt: string;
}

export type GoalRunReason = 'user' | 'cancelled' | 'session-reentry' | 'recovery-required' | 'exhausted' | 'unsupported'
  | 'history-unknown' | 'breach' | 'unavailable' | 'replay' | 'failure' | 'refused' | 'session-changed';

/** A round is pending until the normal session writer has published its terminal outcome. */
export interface GoalScheduling {
  readonly schemaVersion: 1;
  readonly phase: 'ready' | 'running' | 'draining' | 'paused';
  readonly round: number;
  readonly pendingRound: boolean;
  readonly updatedAt: string;
  readonly reason?: GoalRunReason;
  readonly drain?: 'settled' | 'pending' | 'unknown';
  readonly lastOutcome?: 'answer' | 'step-limit' | 'failure' | 'refused' | 'cancelled';
}

export interface GoalSubmissionHost {
  /** Includes pending user input, drafts, images, questions, pickers and shutdown. */
  readonly ready: () => boolean;
  /** Uses the host's ordinary prompt path without presenting the text as human input. */
  readonly submit: (prompt: string, metadata: Record<string, unknown>) => Promise<void>;
  /** Releases queued human input only after durable round settlement has been attempted. */
  readonly settled?: () => void;
}

export class GoalRunError extends Error {
  constructor(readonly reason: GoalRunReason | 'owned') {
    super(`Goal scheduling ${reason}.`);
    this.name = 'GoalRunError';
  }
}
