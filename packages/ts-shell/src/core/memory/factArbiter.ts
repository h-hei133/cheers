import type {
  MemoryFact,
  MemoryCategory,
  MemoryScope,
  ArbitrationDecision,
} from "./types.js";
import { MemoryStore } from "./memoryStore.js";

/**
 * Additive Fact Arbiter
 * An arbitration machine over candidate facts:
 * Compares candidate facts against existing memories to determine:
 * - ADD: New orthogonal fact
 * - UPDATE: Refines, enriches, or updates existing fact
 * - INVALIDATE: Overrides or contradicts previous fact
 * - NOOP: Identical fact already exists
 */
export class FactArbiter {
  constructor(private readonly store: MemoryStore) {}

  public arbitrate(input: {
    statement: string;
    category?: MemoryCategory;
    scope?: MemoryScope;
    confidence?: number;
    entities?: readonly string[];
  }): ArbitrationDecision {
    const statement = input.statement.trim();
    const category = input.category ?? this.inferCategory(statement);
    const scope = input.scope ?? "project";
    const confidence = Math.min(1.0, Math.max(0.1, input.confidence ?? 0.9));
    const entities = input.entities ?? this.extractEntities(statement);

    const existingFacts = this.store.getAll();

    // 1. Exact or near-duplicate check (NOOP)
    const exactMatch = existingFacts.find(
      (f) =>
        f.status === "active" &&
        f.statement.toLowerCase().trim() === statement.toLowerCase(),
    );
    if (exactMatch) {
      return {
        kind: "NOOP",
        targetFactId: exactMatch.id,
        reason: "Identical active fact already recorded",
        statement,
        category,
        scope,
        confidence,
        entities,
      };
    }

    // 2. High semantic overlap & contradiction check
    const candidateTokens = new Set(this.tokenize(statement));
    let highestOverlapFact: MemoryFact | null = null;
    let maxOverlapRatio = 0;

    if (candidateTokens.size > 0) {
      for (const f of existingFacts) {
        if (f.status !== "active") continue;
        const fTokens = new Set(this.tokenize(f.statement));
        if (fTokens.size === 0) continue;

        let intersectionCount = 0;
        for (const t of candidateTokens) {
          if (fTokens.has(t)) {
            intersectionCount++;
          }
        }

        // Jaccard similarity: intersection / union
        const unionSize = candidateTokens.size + fTokens.size - intersectionCount;
        const overlapRatio = unionSize > 0 ? intersectionCount / unionSize : 0;

        if (overlapRatio > maxOverlapRatio) {
          maxOverlapRatio = overlapRatio;
          highestOverlapFact = f;
        }
      }
    }

    const isContradiction = highestOverlapFact ? this.detectContradiction(statement, highestOverlapFact.statement) : false;

    // Contradiction invalidation requires both significant semantic overlap AND positive contradiction signal
    if (highestOverlapFact && maxOverlapRatio >= 0.35 && isContradiction) {
      return {
        kind: "INVALIDATE",
        targetFactId: highestOverlapFact.id,
        reason: `Contradicts or deprecates prior fact '${highestOverlapFact.statement}'`,
        statement,
        category,
        scope,
        confidence,
        entities,
      };
    }

    // Update requires category match and high token overlap
    if (highestOverlapFact && highestOverlapFact.category === category && maxOverlapRatio >= 0.35) {
      return {
        kind: "UPDATE",
        targetFactId: highestOverlapFact.id,
        reason: `Refines or updates existing fact '${highestOverlapFact.statement}'`,
        statement,
        category,
        scope,
        confidence,
        entities,
      };
    }
    return {
      kind: "ADD",
      reason: "New orthogonal fact statement",
      statement,
      category,
      scope,
      confidence,
      entities,
    };
  }

  public applyDecision(decision: ArbitrationDecision): MemoryFact | null {
    if (decision.kind === "NOOP") {
      return decision.targetFactId ? this.store.get(decision.targetFactId) ?? null : null;
    }

    const now = Date.now();
    const newId = `fact_${Math.random().toString(36).slice(2, 10)}_${now}`;

    if (decision.kind === "INVALIDATE" && decision.targetFactId) {
      this.store.invalidate(
        decision.targetFactId,
        decision.reason,
        newId,
      );
    } else if (decision.kind === "UPDATE" && decision.targetFactId) {
      this.store.invalidate(
        decision.targetFactId,
        decision.reason,
        newId,
      );
    }

    const newFact: MemoryFact = {
      id: newId,
      statement: decision.statement,
      category: decision.category,
      scope: decision.scope,
      confidence: decision.confidence,
      createdAt: now,
      updatedAt: now,
      status: "active",
      entities: decision.entities,
    };

    this.store.put(newFact);
    return newFact;
  }

  private inferCategory(statement: string): MemoryCategory {
    const s = statement.toLowerCase();
    if (s.includes("rule") || s.includes("must") || s.includes("cannot") || s.includes("require")) {
      return "constraint";
    }
    if (s.includes("arch") || s.includes("design") || s.includes("layer") || s.includes("module")) {
      return "architecture";
    }
    if (s.includes("prefer") || s.includes("style") || s.includes("default")) {
      return "preference";
    }
    if (s.includes("fix") || s.includes("bug") || s.includes("error") || s.includes("issue")) {
      return "bugfix";
    }
    return "convention";
  }

  private extractEntities(statement: string): string[] {
    const words = statement.split(/\s+/);
    const entities = new Set<string>();
    for (const w of words) {
      const clean = w.replace(/^[^\w]+|[^\w]+$/g, "");
      if (/^[A-Z][a-zA-Z0-9]+$/.test(clean) || /^[a-z]+_[a-z0-9_]+$/.test(clean) || /^[a-z]+-[a-z0-9-]+$/.test(clean)) {
        if (clean.length > 2) {
          entities.add(clean);
        }
      }
    }
    return Array.from(entities);
  }

  private detectContradiction(newStatement: string, oldStatement: string): boolean {
    const ns = newStatement.toLowerCase();
    const os = oldStatement.toLowerCase();
    if (ns.includes("no longer") || ns.includes("deprecated") || ns.includes("instead of") || ns.includes("replaced")) {
      return true;
    }
    if ((ns.includes("do not") || ns.includes("don't") || ns.includes("never")) && !os.includes("never") && !os.includes("do not")) {
      return true;
    }
    return false;
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}_-]/gu, " ")
      .split(/\s+/)
      .filter((t) => t.length > 1);
  }
}
