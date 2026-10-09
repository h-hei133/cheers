export type PaperProvider = 'openalex' | 'arxiv' | 'semantic-scholar';
export type PaperAction = 'search' | 'lookup' | 'references' | 'citations';
export interface PaperRequest {
  readonly provider: PaperProvider | 'auto';
  readonly action: PaperAction;
  readonly query?: string;
  readonly identifier?: string;
  readonly numResults: number;
  readonly pages: number;
}
export interface PaperItem {
  readonly retrieval?: { readonly url: string; readonly contentHash: string; readonly fetchedAt: string; readonly bytes: number };
  readonly provider: PaperProvider;
  readonly id: string;
  readonly title: string;
  readonly url: string;
  readonly doi?: string;
  readonly arxiv?: string;
  readonly version?: string;
  readonly abstract?: string;
  readonly publishedAt?: string;
  readonly updatedAt?: string;
  readonly authors: readonly string[];
  readonly fulltextUrls: readonly string[];
  readonly references: readonly string[];
  readonly retracted?: boolean;
  readonly fields: readonly string[];
  readonly limits: readonly string[];
}
export interface PaperResponse {
  readonly items: readonly PaperItem[];
  readonly next?: string;
}
