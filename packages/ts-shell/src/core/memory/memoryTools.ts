import type {
  MemoryCategory,
  MemoryScope,
} from "./types.js";
import { getMemoryStore } from "./memoryStore.js";
import { FactArbiter } from "./factArbiter.js";

export interface MemoryRetainInput {
  readonly items: Array<{
    readonly statement: string;
    readonly category?: MemoryCategory;
    readonly scope?: MemoryScope;
    readonly confidence?: number;
  }>;
}

export interface MemoryRecallInput {
  readonly query: string;
  readonly category?: MemoryCategory;
  readonly scope?: MemoryScope;
  readonly limit?: number;
}

export interface MemoryEditInput {
  readonly id: string;
  readonly op: "update" | "invalidate";
  readonly reason?: string;
  readonly replacement?: string;
}

/**
 * Executes memory_retain tool: adds or updates facts via additive arbitration.
 */
export async function executeMemoryRetain(input: MemoryRetainInput): Promise<string> {
  const store = getMemoryStore();
  const arbiter = new FactArbiter(store);

  const results: string[] = [];
  for (const item of input.items) {
    const decision = arbiter.arbitrate({
      statement: item.statement,
      category: item.category,
      scope: item.scope,
      confidence: item.confidence,
    });

    const fact = arbiter.applyDecision(decision);
    if (decision.kind === "NOOP") {
      results.push(`- [NOOP] "${item.statement}" (already recorded as ${decision.targetFactId})`);
    } else if (decision.kind === "ADD") {
      results.push(`- [ADD] "${item.statement}" -> recorded as \`${fact?.id}\``);
    } else if (decision.kind === "UPDATE") {
      results.push(`- [UPDATE] "${item.statement}" -> updated from \`${decision.targetFactId}\` to \`${fact?.id}\``);
    } else if (decision.kind === "INVALIDATE") {
      results.push(`- [INVALIDATE] "${item.statement}" -> superseded \`${decision.targetFactId}\``);
    }
  }

  return `Memory facts processed:\n${results.join("\n")}`;
}

/**
 * Executes memory_recall tool: queries memory facts using hybrid BM25 + entity boosting.
 */
export async function executeMemoryRecall(input: MemoryRecallInput): Promise<string> {
  const store = getMemoryStore();
  const matches = store.query({
    query: input.query,
    category: input.category,
    scope: input.scope,
    limit: input.limit ?? 5,
  });

  if (matches.length === 0) {
    return `No active memory facts found matching query "${input.query}".`;
  }

  const lines: string[] = [`# Recalled Memory Facts (query: "${input.query}")`, ""];
  matches.forEach((m, idx) => {
    lines.push(`### ${idx + 1}. [${m.fact.category.toUpperCase()}] ${m.fact.statement}`);
    lines.push(`- **ID**: \`${m.fact.id}\` | **Score**: ${m.score} | **Scope**: ${m.fact.scope}`);
    if (m.matchReasons.length > 0) {
      lines.push(`- **Match Context**: ${m.matchReasons.join("; ")}`);
    }
    lines.push("");
  });

  return lines.join("\n").trimEnd();
}

/**
 * Executes memory_edit tool: explicitly invalidates or updates a memory fact with provenance.
 */
export async function executeMemoryEdit(input: MemoryEditInput): Promise<string> {
  const store = getMemoryStore();
  const fact = store.get(input.id);
  if (!fact) {
    return `Error: Memory fact with ID '${input.id}' not found.`;
  }

  if (input.op === "invalidate") {
    const success = store.invalidate(
      input.id,
      input.reason ?? "Explicitly invalidated by user/agent",
    );
    return success
      ? `Memory fact \`${input.id}\` marked as INVALIDATED.`
      : `Failed to invalidate memory fact \`${input.id}\`.`;
  }

  if (input.op === "update") {
    if (!input.replacement) {
      return "Error: 'replacement' statement required for update operation.";
    }
    const arbiter = new FactArbiter(store);
    const decision = arbiter.arbitrate({
      statement: input.replacement,
      category: fact.category,
      scope: fact.scope,
    });
    const updatedFact = arbiter.applyDecision(decision);
    return `Memory fact \`${input.id}\` updated to \`${updatedFact?.id}\`: "${input.replacement}".`;
  }

  return `Unsupported memory operation: ${input.op}`;
}

/**
 * Executes memory_inspect tool: displays memory bank statistics and category breakdown.
 */
export async function executeMemoryInspect(): Promise<string> {
  const store = getMemoryStore();
  const stats = store.getStats();

  const lines: string[] = [
    "# QuadMemory Bank Inspection",
    "",
    `Total Facts: ${stats.totalFacts} (Active: ${stats.activeFacts}, Invalidated: ${stats.invalidatedFacts})`,
    "",
    "### Category Distribution:",
    `- Architecture: ${stats.categoryCounts.architecture}`,
    `- Conventions: ${stats.categoryCounts.convention}`,
    `- Constraints: ${stats.categoryCounts.constraint}`,
    `- Preferences: ${stats.categoryCounts.preference}`,
    `- Bugfixes: ${stats.categoryCounts.bugfix}`,
    "",
    "### Scope Distribution:",
    `- Project Scope: ${stats.scopeCounts.project}`,
    `- Global Scope: ${stats.scopeCounts.global}`,
  ];

  return lines.join("\n");
}
