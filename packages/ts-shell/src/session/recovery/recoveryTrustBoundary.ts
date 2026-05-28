export interface RecoveryTrustBoundaryBlock {
  readonly sessionId: string;
  readonly reason:
    | "session-corrupt"
    | "terminal-evidence-indeterminate"
    | "continuation-evidence-missing";
  readonly detail: string;
  readonly recoveryHint: string;
}

export function projectRecoveryTrustBoundaryBlock(input: {
  readonly sessionId: string;
  readonly sessionDir: string;
  readonly reason: RecoveryTrustBoundaryBlock["reason"];
  readonly detail: string;
}): RecoveryTrustBoundaryBlock {
  return {
    sessionId: input.sessionId,
    reason: input.reason,
    detail: input.detail,
    recoveryHint: `Session ${input.sessionId} is not recoverable. Start a fresh session or manually repair ${input.sessionDir}.`,
  };
}
