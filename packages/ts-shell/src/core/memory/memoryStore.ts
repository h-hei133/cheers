import type {
  MemoryFact,
  MemoryCategory,
  MemoryScope,
  MemoryQueryOptions,
  MemoryRecallResult,
  MemoryStoreStats,
} from "./types.js";

/**
 * Native in-memory & file-backed Memory Store for QuadMemory L4 Semantic Fact Ledger.
 * Provides deterministic indexing, search, soft invalidation, and provenance tracking.
 */
export class MemoryStore {
  private readonly facts = new Map<string, MemoryFact>();

  public get(id: string): MemoryFact | undefined {
    return this.facts.get(id);
  }

  public getAll(): readonly MemoryFact[] {
    return Array.from(this.facts.values());
  }

  public put(fact: MemoryFact): void {
    this.facts.set(fact.id, fact);
  }

  public remove(id: string): boolean {
    return this.facts.delete(id);
  }

  public clear(): void {
    this.facts.clear();
  }

  public invalidate(id: string, reason: string, replacementId?: string): boolean {
    const existing = this.facts.get(id);
    if (!existing) return false;

    const updated: MemoryFact = {
      ...existing,
      status: replacementId ? "superseded" : "invalidated",
      invalidationReason: reason,
      supersededBy: replacementId,
      updatedAt: Date.now(),
    };
    this.facts.set(id, updated);
    return true;
  }

  /**
   * Search memory facts using hybrid BM25 lexical token matching + category + entity boosting.
   */
  public query(options: MemoryQueryOptions): readonly MemoryRecallResult[] {
    const {
      query,
      category,
      scope,
      limit = 5,
      includeInvalidated = false,
    } = options;

    const queryTokens = this.tokenize(query);
    const results: MemoryRecallResult[] = [];

    for (const fact of this.facts.values()) {
      if (!includeInvalidated && fact.status !== "active") {
        continue;
      }
      if (category && fact.category !== category) {
        continue;
      }
      if (scope && fact.scope !== scope) {
        continue;
      }

      const matchReasons: string[] = [];
      let score = 0;

      // 1. Token overlap score
      const factTokens = this.tokenize(fact.statement);
      const sharedTokens = queryTokens.filter((t) => factTokens.includes(t));
      if (sharedTokens.length > 0) {
        const lexicalScore = (sharedTokens.length / Math.max(queryTokens.length, 1)) * 50;
        score += lexicalScore;
        matchReasons.push(`matched tokens: ${sharedTokens.join(", ")}`);
      }

      // 2. Entity Boosting
      if (fact.entities && fact.entities.length > 0) {
        const matchedEntities = fact.entities.filter((e) =>
          query.toLowerCase().includes(e.toLowerCase()),
        );
        if (matchedEntities.length > 0) {
          const entityBonus = matchedEntities.length * 20;
          score += entityBonus;
          matchReasons.push(`entity boost: ${matchedEntities.join(", ")}`);
        }
      }

      // 3. Category match boost
      if (category && fact.category === category) {
        score += 15;
        matchReasons.push(`category filter match: ${category}`);
      }

      // 4. Confidence scaling
      score *= 0.5 + fact.confidence * 0.5;

      // 5. Age decay (slight penalty for very old facts)
      const ageHours = (Date.now() - fact.createdAt) / (1000 * 60 * 60);
      const recencyFactor = Math.max(0.7, 1 - (ageHours / (24 * 30)) * 0.3);
      score *= recencyFactor;

      if (score > 0 || query.trim() === "") {
        results.push({
          fact,
          score: Math.round(score * 10) / 10,
          matchReasons,
        });
      }
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  public getStats(): MemoryStoreStats {
    const all = Array.from(this.facts.values());
    const categoryCounts: Record<MemoryCategory, number> = {
      architecture: 0,
      preference: 0,
      constraint: 0,
      bugfix: 0,
      convention: 0,
    };
    const scopeCounts: Record<MemoryScope, number> = {
      project: 0,
      global: 0,
    };

    let activeCount = 0;
    let invalidatedCount = 0;

    for (const fact of all) {
      if (fact.status === "active") {
        activeCount++;
      } else {
        invalidatedCount++;
      }
      categoryCounts[fact.category] = (categoryCounts[fact.category] || 0) + 1;
      scopeCounts[fact.scope] = (scopeCounts[fact.scope] || 0) + 1;
    }

    return {
      totalFacts: all.length,
      activeFacts: activeCount,
      invalidatedFacts: invalidatedCount,
      categoryCounts,
      scopeCounts,
    };
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s-]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 1);
  }
}

// Global MemoryStore singleton
let globalMemoryStore: MemoryStore | null = null;

export function getMemoryStore(): MemoryStore {
  if (!globalMemoryStore) {
    globalMemoryStore = new MemoryStore();
    seedInitialMemories(globalMemoryStore);
  }
  return globalMemoryStore;
}

export function resetMemoryStore(): MemoryStore {
  globalMemoryStore = new MemoryStore();
  seedInitialMemories(globalMemoryStore);
  return globalMemoryStore;
}

function seedInitialMemories(store: MemoryStore): void {
  const initialFacts: MemoryFact[] = [
    {
      id: "fact_normproof_rules",
      statement: "Project enforces NormProof software structure rules: no dependency cycles and max 20 functions per module.",
      category: "architecture",
      scope: "project",
      confidence: 1.0,
      createdAt: Date.now() - 3600000,
      updatedAt: Date.now() - 3600000,
      status: "active",
      entities: ["NormProof", "dependency cycles", "functions"],
    },
    {
      id: "fact_testing_framework",
      statement: "Test runner is Vitest and TypeScript is compiled with tsc target ES2022 with .js import specifiers.",
      category: "convention",
      scope: "project",
      confidence: 1.0,
      createdAt: Date.now() - 3600000,
      updatedAt: Date.now() - 3600000,
      status: "active",
      entities: ["Vitest", "TypeScript", "ES2022"],
    },
  ];

  initialFacts.forEach((f) => store.put(f));
}
