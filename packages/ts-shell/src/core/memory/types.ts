/**
 * QuadMemory Types and Contracts
 * Represents the native 4-layer memory model (Working, Episodic, Procedural, Semantic Fact Ledger).
 */

export type MemoryCategory =
  | "architecture"
  | "preference"
  | "constraint"
  | "bugfix"
  | "convention";

export type MemoryScope = "project" | "global";

export type FactStatus = "active" | "invalidated" | "superseded";

export interface MemoryFact {
  readonly id: string;
  readonly statement: string;
  readonly category: MemoryCategory;
  readonly scope: MemoryScope;
  readonly confidence: number;
  readonly sourceTurnId?: string;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly status: FactStatus;
  readonly supersededBy?: string;
  readonly invalidationReason?: string;
  readonly entities?: readonly string[];
}

export type ArbitrationDecisionKind = "ADD" | "UPDATE" | "INVALIDATE" | "NOOP";

export interface ArbitrationDecision {
  readonly kind: ArbitrationDecisionKind;
  readonly targetFactId?: string;
  readonly reason: string;
  readonly statement: string;
  readonly category: MemoryCategory;
  readonly scope: MemoryScope;
  readonly confidence: number;
  readonly entities?: readonly string[];
}

export interface MemoryQueryOptions {
  readonly query: string;
  readonly category?: MemoryCategory;
  readonly scope?: MemoryScope;
  readonly limit?: number;
  readonly includeInvalidated?: boolean;
}

export interface MemoryRecallResult {
  readonly fact: MemoryFact;
  readonly score: number;
  readonly matchReasons: readonly string[];
}

export interface MemoryStoreStats {
  readonly totalFacts: number;
  readonly activeFacts: number;
  readonly invalidatedFacts: number;
  readonly categoryCounts: Record<MemoryCategory, number>;
  readonly scopeCounts: Record<MemoryScope, number>;
}
