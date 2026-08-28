export type RepoIntelligenceFileRole =
  | "entrypoint"
  | "test"
  | "config"
  | "docs"
  | "source";

export interface RepoIntelligenceFile {
  readonly path: string;
  readonly safeLabel: string;
  readonly role: RepoIntelligenceFileRole;
  readonly sizeBytes: number;
  readonly mtimeMs: number;
  readonly symbolHints: readonly string[];
  readonly packageName?: string;
}

export interface RepoIntelligenceCandidate {
  readonly candidateId: string;
  readonly path: string;
  readonly safeLabel: string;
  readonly role: RepoIntelligenceFileRole;
  readonly packageName?: string;
  readonly moduleHint: string;
  readonly score: number;
  readonly scoreComponents: {
    readonly taskTokenOverlap: number;
    readonly roleBoost: number;
    readonly scriptBoost: number;
    readonly exactNameBoost: number;
    readonly primarySourceNameBoost: number;
    readonly freshnessBoost: number;
  };
  readonly reasons: readonly string[];
  readonly pathMatchReasons: readonly string[];
  readonly taskTokenMatchReasons: readonly string[];
  readonly testAdjacencyHints: readonly string[];
  readonly symbolHints: readonly string[];
  readonly freshness: "fresh-stat" | "unknown";
  readonly uncertaintyNotes: readonly string[];
  readonly notProvenClaims: readonly string[];
}

export type RepoDiscoveryConfidence = "high" | "medium" | "low";

export interface RepoDiscoveryScanProfile {
  readonly profileId: string;
  readonly workspaceLabel: string;
  readonly scanMode: "bounded-local-files";
  readonly scanBudget: {
    readonly maxFiles: number;
    readonly pathPriorityPrefillLimit: number;
    readonly pathPriorityScanLimit: number;
  };
  readonly filesConsideredCount: number;
  readonly filesOmittedCount: number;
  readonly omittedReasonCategories: readonly string[];
  readonly rawContentExcluded: true;
  readonly packageMapAvailable: boolean;
  readonly moduleMapAvailable: boolean;
  readonly scanLimitReached: boolean;
  readonly discoveryConfidence: RepoDiscoveryConfidence;
  readonly notProvenClaims: readonly string[];
}

export interface RepoCandidateOmission {
  readonly reason: string;
  readonly count: number;
  readonly exampleLabels: readonly string[];
  readonly notProvenClaims: readonly string[];
}

export type RepoTargetRankingAmbiguityState =
  | "unambiguous-top-candidate"
  | "multiple-plausible-candidates"
  | "weak-signal-candidate"
  | "no-candidate";

export interface RepoTargetRankingEvidence {
  readonly rankingId: string;
  readonly ambiguityState: RepoTargetRankingAmbiguityState;
  readonly selectedCandidateId?: string;
  readonly competingCandidateIds: readonly string[];
  readonly weakCandidateIds: readonly string[];
  readonly missingDiscoveryFacts: readonly string[];
  readonly notProvenClaims: readonly string[];
  readonly evidence: readonly string[];
}

export interface RepoIntelligenceSnapshot {
  readonly snapshotId: string;
  readonly workspaceRootLabel: string;
  readonly packageMap: readonly {
    readonly name: string;
    readonly path: string;
    readonly scripts: readonly string[];
  }[];
  readonly moduleMap: readonly {
    readonly directory: string;
    readonly files: number;
    readonly tests: number;
  }[];
  readonly entrypointMap: readonly string[];
  readonly testMap: readonly string[];
  readonly configMap: readonly string[];
  readonly boundaryHints: readonly string[];
  readonly files: readonly RepoIntelligenceFile[];
  readonly scanProfile: RepoDiscoveryScanProfile;
  readonly candidateOmissions: readonly RepoCandidateOmission[];
  readonly cacheStatus: "disabled" | "enabled-not-used";
  readonly staleIndexWarnings: readonly string[];
  readonly evidence: readonly string[];
}

export interface RepoIntelligenceResult {
  readonly snapshot: RepoIntelligenceSnapshot;
  readonly candidates: readonly RepoIntelligenceCandidate[];
  readonly targetRanking: RepoTargetRankingEvidence;
  readonly recentRelevantFiles: readonly string[];
  readonly missingFacts: readonly string[];
  readonly nextReadSuggestions: readonly string[];
  readonly evidence: readonly string[];
}

export interface RepoScanProfile {
  readonly tokens: readonly string[];
  readonly codeLike: boolean;
  readonly docsLike: boolean;
}

export interface DiscoveredRepoFiles {
  readonly files: readonly RepoIntelligenceFile[];
  readonly omissions: ReadonlyMap<string, { readonly count: number; readonly examples: readonly string[] }>;
  readonly filesConsideredCount: number;
}
