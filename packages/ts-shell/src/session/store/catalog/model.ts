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
  /** Bounded conversation excerpts already read for the catalog projection. */
  readonly preview?: {
    readonly prompt?: string;
    readonly answer?: string;
  };
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
  /** The attempt-local source budget stopped acquisition before a complete index was built. */
  readonly sourceLimited?: boolean;
  /** Authorized matches checked so far, independently of page retention. */
  readonly total?: number;
  readonly continuation?: SessionCatalogContinuation;
  readonly hasMore?: boolean;
}

export interface SessionCatalogQuery {
  readonly needle: string;
  readonly after?: SessionCatalogContinuation;
  readonly browse?: SessionCatalogBrowse;
}

/** Only the catalogue that issued this token may use it. No session data leaves the owner. */
export interface SessionCatalogBrowse { readonly id: string }

export type SessionCatalogBoundary = Pick<SessionSummary, 'id' | 'version' | 'pinned' | 'updatedAt'>;

/** A process-local browse attempt with a live version check for every offered row. */
export interface SessionCatalogContinuation {
  readonly attemptId: string;
  readonly browseId?: string;
  readonly sessionId: string;
  readonly projectRoot: string;
  readonly allProjects: boolean;
  readonly needle: string;
  readonly limit: number;
  readonly boundary: SessionCatalogBoundary;
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
  pageSize: 40,
  attemptEntries: 20_000,
  attemptBytes: 64 * 1024 * 1024,
  diagnosticSamples: 32,
});
