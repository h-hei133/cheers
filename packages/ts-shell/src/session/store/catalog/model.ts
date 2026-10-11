import type { Session } from '../../schema/sessionRecord.js';

/** A listing projection, never a substitute for the stored session at action time. */
export interface SessionSummary {
  readonly id: string;
  readonly projectRoot: string;
  readonly title?: string;
  readonly pinned?: boolean;
  /** Title matching must not use an inferred title from omitted conversation data. */
  readonly titleComplete: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly status?: Session['status'];
  readonly reentry: 'available' | 'empty' | 'unknown';
  readonly quality: 'complete' | 'limited';
  /** Opaque version of the directory and all three core files. */
  readonly version: string;
}

export interface SessionCatalogSnapshot {
  readonly sessions: readonly SessionSummary[];
  readonly currentUnavailable?: string;
  readonly scanned: number;
  readonly unreadable: number;
  readonly limited: number;
  readonly status: 'scanning' | 'complete' | 'partial';
}

export interface SessionReferenceQuery {
  readonly projectRoot?: string;
  readonly strictProject?: boolean;
  readonly signal?: AbortSignal;
}

export interface SessionReferenceResolution {
  readonly ok: boolean;
  readonly sessionId?: string;
  readonly reason?: 'not-found' | 'ambiguous' | 'incomplete' | 'outside-project';
  readonly candidates?: readonly SessionSummary[];
}

export const CATALOG_LIMITS = Object.freeze({
  directoryEntries: 64,
  summaries: 16,
  concurrency: 4,
  cacheEntries: 512,
  metadataBytes: 64 * 1024,
  stateBytes: 1024 * 1024,
  transcriptBytes: 2 * 1024 * 1024,
  readChunkBytes: 64 * 1024,
});
