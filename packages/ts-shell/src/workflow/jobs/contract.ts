export interface JobOrigin {
  readonly kind: 'local' | 'collaboration' | 'goal' | 'advisor';
  readonly principal?: string;
  readonly acceptanceId?: string;
  readonly parentId?: string;
  readonly goalId?: string;
  readonly roomId?: string;
  readonly serviceEpoch?: string;
  readonly hostGeneration?: number;
  readonly sourceEntryId?: string;
}
export type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'unknown';
