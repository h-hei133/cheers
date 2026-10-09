export type SourceReadStatus = 'metadata' | 'abstract' | 'read' | 'truncated' | 'no-text' | 'failed' | 'restricted';
export interface SourceExcerpt {
  readonly id: string;
  readonly location: string;
  readonly text: string;
}
export interface SourceRecord {
  readonly id: string;
  readonly kind: 'web' | 'file' | 'paper' | 'search';
  readonly provider: string;
  readonly locator: string;
  readonly finalLocator?: string;
  readonly fetchedAt: string;
  readonly callId: string;
  readonly childId: string;
  readonly briefRevision: number;
  readonly status: SourceReadStatus;
  readonly contentHash?: string;
  readonly hashScope?: string;
  readonly readKey?: string;
  readonly mime?: string;
  readonly bytes?: number;
  readonly parser?: string;
  readonly title?: string;
  readonly identifiers?: { readonly doi?: string; readonly arxiv?: string; readonly version?: string; readonly providerId?: string };
  readonly replicas: readonly string[];
  readonly fulltextUrls?: readonly string[];
  readonly retrieval?: { readonly url: string; readonly contentHash: string; readonly fetchedAt: string; readonly bytes: number };
  readonly excerpts: readonly SourceExcerpt[];
  readonly limits: readonly string[];
  readonly stale?: boolean;
  readonly failure?: string;
}
export interface ClaimReference {
  readonly sourceId: string;
  readonly excerptId: string;
  readonly quote: string;
}
export interface ClaimRecord {
  readonly id: string;
  readonly questionId: string;
  readonly text: string;
  readonly kind: 'behavior' | 'method' | 'evaluation' | 'metadata' | 'other';
  readonly scope: string;
  readonly support: 'direct' | 'indirect' | 'insufficient' | 'opposed';
  readonly supportReason: string;
  readonly supporting: readonly ClaimReference[];
  readonly opposing: readonly ClaimReference[];
  readonly conflicts: readonly string[];
  readonly limitations: readonly string[];
}
export interface ResearchDraft {
  readonly summary: string;
  readonly claims: readonly ClaimRecord[];
  readonly covered: readonly string[];
  readonly uncovered: readonly string[];
  readonly limitations: readonly string[];
}
