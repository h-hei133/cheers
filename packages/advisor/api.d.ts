export interface AdvisorConfig {
  readonly target?: string;
  readonly every: number;
  readonly timeoutMs: number;
  readonly mode: 'turn' | 'end';
}

export type AdvisorStatus = 'off' | 'ready' | 'held' | 'reviewing' | 'reviewed' | 'paused' | 'no-model' | 'unavailable' | 'error' | 'timeout' | 'cancelled' | 'stale';

export interface AdvisorCheckpoint {
  readonly id: string;
  readonly timestamp: string;
  readonly sourcePromptEntryId: string;
  readonly step: number;
  readonly willContinue: boolean;
  readonly failed: boolean;
  readonly digest: string;
  readonly text: string;
  readonly truncated: boolean;
  readonly frontier: string;
  readonly goal: string;
}

export interface AdvisorCoverage {
  readonly checkpoints: readonly { readonly id: string; readonly digest: string }[];
  readonly truncated: boolean;
}

export interface AdvisorNote {
  readonly id: string;
  readonly checkpointId: string;
  readonly checkpointDigest: string;
  readonly epoch: number;
  readonly target: string;
  readonly targetIdentity?: string;
  readonly timestamp: string;
  readonly text: string;
  readonly submittedAt?: string;
  readonly coverage: AdvisorCoverage;
}

export interface AdvisorState {
  readonly sessionId: string;
  readonly sessionCreatedAt: string;
  readonly workspace: { readonly path: string; readonly identity: string };
  readonly schemaVersion: 1;
  readonly epoch: number;
  readonly enabled: boolean;
  readonly config?: AdvisorConfig;
  readonly status: AdvisorStatus;
  readonly eligible: number;
  readonly captured: number;
  readonly checkpoints: readonly AdvisorCheckpoint[];
  readonly notes: readonly AdvisorNote[];
  readonly pending?: {
    readonly id: string;
    readonly epoch: number;
    readonly checkpointId: string;
    readonly startedAt: string;
    readonly owner?: { readonly token: string; readonly pid: number; readonly hostname: string; readonly startedAt: string };
  };
}

export type RecordGuard = (value: unknown) => value is Record<string, unknown>;
export interface AdvisorCodec {
  validAdvisorConfig(value: unknown): value is AdvisorConfig;
  decodeAdvisor(value: unknown): AdvisorState | undefined;
}
export function createAdvisorCodec(isRecord: RecordGuard): AdvisorCodec;

export interface AdvisorReviewPacket {
  readonly context: string;
  readonly coverage: AdvisorCoverage;
}

export function advisorReviewPacket(state: Pick<AdvisorState, 'checkpoints' | 'captured'>): AdvisorReviewPacket;
