/** Rendered messages, rich metadata, and flat display edges for a standalone exported page. */
export interface ExportImage {
  readonly mediaType: string;
  readonly data: string;
}

export interface ExportEntry {
  readonly id: string;
  readonly role: string;
  readonly content: string;
  /** Derived Markdown preview. The standalone renderer recomputes it from content. */
  readonly html: string;
  readonly reasoning?: { readonly text: string; readonly redacted?: boolean };
  readonly images?: readonly ExportImage[];
  readonly toolCalls?: readonly { readonly id: string; readonly name: string; readonly arguments: string }[];
  readonly toolCallId?: string;
  readonly toolDiff?: string;
  readonly isError?: boolean;
  readonly origin?: { readonly provider?: string; readonly model: string };
  readonly timestamp?: string;
  readonly sourceEntryId?: string;
}

export interface ExportTreeNode {
  readonly id: string;
  readonly parentId?: string;
  readonly depth: number;
  readonly role?: string;
  readonly kind: string;
  readonly preview: string;
  readonly timestamp?: string;
}

export interface ExportSessionStats {
  readonly userMessages: number;
  readonly assistantMessages: number;
  readonly toolResults: number;
  readonly commandOutputs: number;
  readonly toolCalls: number;
  readonly compactions: number;
  readonly branchSummaries: number;
  readonly models: readonly string[];
  readonly accounting: ExportAccounting;
}

/** Session cumulative accounting includes retired branches and auxiliary requests. */
export interface ExportAccounting {
  readonly scope: 'session';
  readonly status: 'recorded' | 'partial' | 'unavailable';
  readonly usageStatus: 'recorded' | 'partial' | 'unavailable';
  readonly recordedRequests?: number;
  readonly tokens?: {
    readonly input?: number;
    readonly output?: number;
    readonly cacheRead?: number;
    readonly cacheWrite?: number;
    readonly total: number;
  };
  readonly estimatedCostUsd?: number;
  readonly requestCoverage: {
    readonly status: 'tracked' | 'partial' | 'unavailable';
    readonly scopeCount?: number;
    readonly pending?: number;
    readonly dispatchedUnknown?: number;
    readonly historyUnknown?: boolean;
    readonly breach?: boolean;
    readonly knownPartialTokens?: { readonly input?: number; readonly output?: number };
  };
}

export interface ExportPayload {
  readonly header: { readonly sessionId: string; readonly exportedAt: string; readonly workspace: string };
  readonly tree: readonly ExportTreeNode[];
  readonly entries: readonly ExportEntry[];
  readonly leafId: string | null;
  readonly warnings: readonly string[];
  /** Source completeness for pairing calls with results, independent of media notices. */
  readonly toolPairing?: 'verified' | 'unavailable';
  readonly stats?: ExportSessionStats;
}
