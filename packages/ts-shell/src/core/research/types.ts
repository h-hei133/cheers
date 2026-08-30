/**
 * Deep Research Types and Contracts
 * Standard schemas for multi-agent tree search, claim voting, and cited report synthesis.
 */

export interface SerpQuery {
  readonly query: string;
  readonly researchGoal: string;
}

export interface AtomicLearning {
  readonly id: string;
  readonly statement: string;
  readonly sourceUrl: string;
  readonly sourceTitle?: string;
  readonly confidence: number;
  readonly entities?: readonly string[];
}

export interface VotedClaim {
  readonly statement: string;
  readonly voteCount: number;
  readonly sources: readonly string[];
  readonly consensusStatus: "verified" | "unverified" | "disputed";
  readonly confidenceScore: number;
}

export interface ResearchProgressState {
  readonly currentDepth: number;
  readonly totalDepth: number;
  readonly currentBreadth: number;
  readonly totalBreadth: number;
  readonly totalQueries: number;
  readonly completedQueries: number;
  readonly currentQuery?: string;
}

export interface DeepResearchOptions {
  readonly topic: string;
  readonly breadth?: number;
  readonly depth?: number;
  readonly maxConcurrency?: number;
  readonly onProgress?: (progress: ResearchProgressState) => void;
}

export interface DeepResearchReport {
  readonly topic: string;
  readonly executiveSummary: string;
  readonly verifiedClaims: readonly VotedClaim[];
  readonly unverifiedClaims: readonly VotedClaim[];
  readonly sources: readonly string[];
  readonly totalQueriesRun: number;
  readonly reportMarkdown: string;
  readonly generatedAt: number;
}
