import type { ChatMessageLike } from "../../../core/query/microCompact.js";

export interface TokenCategoryBreakdown {
  readonly systemPromptTokens: number;
  readonly toolsSchemaTokens: number;
  readonly historyTokens: number;
  readonly toolOutputsTokens: number;
  readonly totalUsedTokens: number;
  readonly freeTokens: number;
  readonly autocompactBufferTokens: number;
}

export interface ContextHealthAudit {
  readonly contextWindow: number;
  readonly breakdown: TokenCategoryBreakdown;
  readonly usedPercent: number;
  readonly duplicateFileReads: ReadonlyArray<{ readonly path: string; readonly count: number }>;
  readonly largeToolOutputs: ReadonlyArray<{ readonly toolName: string; readonly chars: number }>;
  readonly suggestions: readonly string[];
  readonly status: "HEALTHY" | "NEAR_CAPACITY" | "OVERFLOW_RISK";
}

/**
 * Estimate tokens from character length (average 3.5 chars / token)
 */
export function estimateTextTokens(text: string | null | undefined): number {
  if (!text) return 0;
  return Math.ceil(text.length / 3.5);
}

/**
 * Analyzes active message history, extracts token categories, detects duplicate reads & bloat,
 * and generates actionable governance suggestions.
 */
export function auditContextHealth(
  messages: readonly ChatMessageLike[],
  options?: {
    readonly contextWindow?: number;
    readonly reserveBuffer?: number;
    readonly systemPromptTokens?: number;
    readonly toolsSchemaTokens?: number;
  },
): ContextHealthAudit {
  const contextWindow = options?.contextWindow ?? 64_000;
  const reserveBuffer = options?.reserveBuffer ?? 8_000;
  const systemPromptTokens = options?.systemPromptTokens ?? 1_850;
  const toolsSchemaTokens = options?.toolsSchemaTokens ?? 1_200;

  let historyTokens = 0;
  let toolOutputsTokens = 0;

  const fileReadCounts = new Map<string, number>();
  const largeToolOutputs: Array<{ toolName: string; chars: number }> = [];

  for (const msg of messages) {
    const contentTokens = estimateTextTokens(msg.content);
    if (msg.role === "tool") {
      toolOutputsTokens += contentTokens;
      const chars = msg.content?.length || 0;
      if (chars > 3_000) {
        largeToolOutputs.push({ toolName: "tool", chars });
      }
    } else if (msg.role === "user" || msg.role === "assistant") {
      let turnTokens = contentTokens;
      if (msg.tool_calls) {
        for (const call of msg.tool_calls) {
          turnTokens += estimateTextTokens(call.function?.name) + estimateTextTokens(call.function?.arguments);
        }
      }
      historyTokens += turnTokens;
    }

    // Detect duplicate read calls from tool_calls
    if (msg.tool_calls) {
      for (const call of msg.tool_calls) {
        if (call.function?.name === "read") {
          try {
            const args = JSON.parse(call.function?.arguments || "{}");
            if (args.path) {
              const p = String(args.path);
              fileReadCounts.set(p, (fileReadCounts.get(p) || 0) + 1);
            }
          } catch {
            // Ignore
          }
        }
      }
    }
  }

  const duplicateFileReads: Array<{ path: string; count: number }> = [];
  for (const [p, count] of fileReadCounts.entries()) {
    if (count > 1) {
      duplicateFileReads.push({ path: p, count });
    }
  }

  const totalUsedTokens =
    systemPromptTokens + toolsSchemaTokens + historyTokens + toolOutputsTokens;
  const freeTokens = Math.max(0, contextWindow - totalUsedTokens - reserveBuffer);
  const usedPercent = Math.round((totalUsedTokens / contextWindow) * 100);

  const suggestions: string[] = [];

  if (usedPercent >= 80) {
    suggestions.push(
      "Context is over 80% capacity. Run `/compact` to generate a structured checkpoint and free memory.",
    );
  }

  if (duplicateFileReads.length > 0) {
    const dups = duplicateFileReads.map((d) => `\`${d.path}\` (${d.count}x)`).join(", ");
    suggestions.push(
      `Duplicate file reads detected for: ${dups}. Prioritize memory reuse or grep over repeated full reads.`,
    );
  }

  if (largeToolOutputs.length > 0) {
    suggestions.push(
      "Large tool outputs (>3,000 chars) are present. Microcompact is pruning older outputs to protect your token budget.",
    );
  }

  if (suggestions.length === 0) {
    suggestions.push("Context allocation is optimal. Plenty of token headroom available.");
  }

  let status: ContextHealthAudit["status"] = "HEALTHY";
  if (usedPercent >= 90) {
    status = "OVERFLOW_RISK";
  } else if (usedPercent >= 75) {
    status = "NEAR_CAPACITY";
  }

  return {
    contextWindow,
    breakdown: {
      systemPromptTokens,
      toolsSchemaTokens,
      historyTokens,
      toolOutputsTokens,
      totalUsedTokens,
      freeTokens,
      autocompactBufferTokens: reserveBuffer,
    },
    usedPercent,
    duplicateFileReads,
    largeToolOutputs,
    suggestions,
    status,
  };
}
