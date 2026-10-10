import type { BoundSessionScope } from '../../session/store/bound.js';
export interface RecordOptions { readonly retention: 'keep' | 'discard'; readonly maxBytes: number; readonly seconds: number }
export interface RecordingRow {
  readonly id: string;
  readonly scope: BoundSessionScope;
  readonly file: string;
  readonly options: RecordOptions;
  readonly phase: 'recording' | 'stopped' | 'cancelled' | 'truncated' | 'failed' | 'unknown' | 'discarded';
  readonly bytes: number;
  readonly reason?: string;
}
export interface RecordingState { readonly version: 1; readonly revision: number; readonly runs: readonly RecordingRow[] }
export interface CastHeader {
  readonly version: 2;
  readonly width: number;
  readonly height: number;
  readonly timestamp: number;
  readonly cheers: { readonly version: 1; readonly id: string; readonly sessionId: string; readonly input: 'excluded'; readonly options: RecordOptions };
}
export type CastEvent = readonly [number, 'o' | 'e' | 'r' | 'm', string];
export interface Cast { readonly header: CastHeader; readonly events: readonly CastEvent[]; readonly incomplete: boolean }
export const recordLimits = Object.freeze({ fileBytes: 16 * 1024 * 1024, eventBytes: 64 * 1024, events: 20000, seconds: 3600 });
