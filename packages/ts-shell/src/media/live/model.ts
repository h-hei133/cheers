import type { BoundSessionScope } from '../../session/store/bound.js';

export interface LiveOptions {
  readonly model: 'gpt-live-1';
  readonly voice: 'marin';
  readonly seconds: number;
  readonly captureDevice: string;
  readonly playbackDevice: string;
}
/** Live has timestamped fragments, not protocol-defined completed turns. */
export interface TranscriptFragment {
  readonly eventId: string;
  readonly speaker: 'user' | 'assistant';
  readonly text: string;
  readonly startMs: number;
  readonly endMs: number;
}
export interface LiveRun {
  readonly id: string;
  readonly scope: BoundSessionScope;
  readonly options: LiveOptions;
  readonly createdAt: number;
  readonly phase: 'starting' | 'active' | 'closing' | 'closed' | 'failed' | 'unknown';
  readonly remoteId?: string;
  readonly attemptId?: string;
  readonly seconds?: number;
  readonly finalUsage: boolean;
  readonly cleanup: 'pending' | 'confirmed' | 'unknown';
  readonly reason?: string;
  readonly fragments: readonly TranscriptFragment[];
}
export interface LiveState { readonly version: 1; readonly revision: number; readonly runs: readonly LiveRun[] }
export const liveLimits = Object.freeze({ messageBytes: 128 * 1024, audioBytes: 96 * 1024,
  transportBytes: 256 * 1024, transcriptBytes: 64 * 1024, fragments: 512, events: 4096 });
