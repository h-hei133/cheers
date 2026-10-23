export interface RecoveryReadAccess {
  readonly signal?: AbortSignal;
  readonly check?: () => void;
  readonly admit?: (bytes: number) => void;
}

export class RecoveryReadLimitError extends Error {
  constructor() { super('Undo preview exceeds its source size limit.'); this.name = 'RecoveryReadLimitError'; }
}

export class RecoveryReadControlError extends Error {
  constructor(reason: unknown) {
    super(reason instanceof Error ? reason.message : 'Recovery reading was refused.');
    this.name = 'RecoveryReadControlError';
  }
}

export function assertRecoveryReadAccess(access: RecoveryReadAccess): void {
  access.signal?.throwIfAborted();
  try { access.check?.(); }
  catch (error) { throw error instanceof RecoveryReadControlError ? error : new RecoveryReadControlError(error); }
}

/** Charges inspected source bytes before body reads, including failed preparations. */
export function recoveryReadBudget(limit: number, signal?: AbortSignal, admission?: () => string | undefined) {
  let used = 0;
  const check = (): void => {
    signal?.throwIfAborted();
    try {
      const blocked = admission?.();
      if (blocked) throw new Error(blocked);
    } catch (error) { throw new RecoveryReadControlError(error); }
  };
  const admit = (bytes: number): void => {
    check();
    if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > limit - used) throw new RecoveryReadLimitError();
    used += bytes;
  };
  return { signal, check, admit, remaining: () => limit - used };
}
