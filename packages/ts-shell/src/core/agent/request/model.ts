export interface RequestScope {
  readonly id: string;
  readonly workspacePath: string;
  readonly workspaceIdentity: string;
}

export interface LedgerBinding {
  readonly sessionId: string;
  readonly sessionCreatedAt: string;
  readonly directoryIdentity: string;
}

/** Inclusive input/output; cache and reasoning subtotals are never added again. */
export interface ModelUsage {
  readonly version: 1;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly cacheReadTokens?: number;
  readonly cacheWriteTokens?: number;
  readonly complete: boolean;
  readonly inconsistent?: boolean;
  /** Retained as evidence; protocol subtotal is never added to input/output again. */
  readonly reportedTotalTokens?: number;
}

/** Only a trusted protocol implementation may prove a complete serialized request. */
export interface RequestBound {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly source: string;
  readonly version: string;
}

export interface PreparedRequest {
  readonly requestId: string;
  readonly bodyDigest: string;
  readonly provider: string;
  readonly model: string;
  readonly endpoint: string;
  readonly purpose: string;
  readonly bound?: RequestBound;
}

export interface PendingAttempt extends PreparedRequest {
  readonly sequence: number;
  /** Handoff was armed durably; remote receipt/termination is not implied. */
  readonly dispatched: boolean;
  readonly usage?: ModelUsage;
}

export interface ScopeLedger {
  readonly scope: RequestScope;
  readonly nextSequence: number;
  readonly finalized: readonly (readonly [number, number])[];
  readonly pending: Readonly<Record<string, PendingAttempt>>;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheWriteTokens: number;
  readonly historyUnknown: boolean;
  readonly breach?: { readonly sequence: number; readonly actualTokens: number; readonly boundTokens: number };
}

export interface RequestLedger extends LedgerBinding {
  readonly schemaVersion: 1;
  readonly meteringVersion: 1;
  readonly scopes: Readonly<Record<string, ScopeLedger>>;
}

export interface BudgetConstraint { readonly cap?: number }
export interface LedgerUpdate<T> { readonly ledger: RequestLedger; readonly value: T }
export interface RequestLedgerStore {
  transaction<T>(admit: boolean, update: (ledger: RequestLedger, constraint: BudgetConstraint) => LedgerUpdate<T>): T;
}

export interface ModelAttempt {
  readonly id: string;
  dispatch(): void;
  confirmUnsent(): void;
  settle(usage?: ModelUsage): void;
}
export interface RequestPolicy {
  reserve(request: PreparedRequest): ModelAttempt;
  /** Native owner may reserve room for later stages; no-cap admission is unchanged. */
  readonly withCompletionReserve?: (tokens: () => number) => RequestPolicy;
  /** Additional native admission is checked under the same ledger transaction. */
  readonly withAdmission?: (admit: () => void) => RequestPolicy;
}

export type ModelTransport = (input: RequestInfo | URL, init: RequestInit,
  beforeDispatch: () => void) => Promise<Response>;

export class ModelAdmissionError extends Error {
  constructor(readonly code: 'unsupported' | 'exhausted' | 'history-unknown' | 'breach' | 'inactive' | 'replay' | 'unavailable',
    readonly persistence: 'unchanged' | 'unknown' | 'persisted' = 'unchanged') {
    super(`Model request admission ${code}; persistence ${persistence}.`);
    this.name = 'ModelAdmissionError';
  }
}
