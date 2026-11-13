import type { ExportEntry, ExportSessionStats, ExportTreeNode } from "./model.js";

/** Compute aggregate message, tool, model, token, and cost statistics for an export payload. */
export function computeExportStats(
  entries: readonly ExportEntry[],
  tree: readonly ExportTreeNode[],
): ExportSessionStats {
  let userMessages = 0;
  let assistantMessages = 0;
  let toolResults = 0;
  let commandOutputs = 0;
  let toolCalls = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  let cacheWriteTokens = 0;
  let costUsd = 0;
  let hasCost = false;
  let hasUsage = false;
  const models = new Set<string>();

  for (const entry of entries) {
    if (entry.role === "user") userMessages += 1;
    else if (entry.role === "assistant") assistantMessages += 1;
    else if (entry.role === "tool") toolResults += 1;
    else if (entry.role === "command") commandOutputs += 1;

    if (entry.toolCalls) toolCalls += entry.toolCalls.length;
    if (entry.origin?.model) {
      models.add(entry.origin.provider ? `${entry.origin.provider}/${entry.origin.model}` : entry.origin.model);
    }
    if (entry.usage) {
      hasUsage = true;
      inputTokens += entry.usage.inputTokens;
      outputTokens += entry.usage.outputTokens;
      cacheReadTokens += entry.usage.cacheReadTokens ?? 0;
      cacheWriteTokens += entry.usage.cacheWriteTokens ?? 0;
      if (entry.usage.costUsd !== undefined) {
        hasCost = true;
        costUsd += entry.usage.costUsd;
      }
    }
  }

  let compactions = 0;
  let branchSummaries = 0;
  for (const node of tree) {
    if (node.kind === "compaction") compactions += 1;
    else if (node.kind === "branch_summary") branchSummaries += 1;
  }

  return {
    userMessages,
    assistantMessages,
    toolResults,
    commandOutputs,
    toolCalls,
    compactions,
    branchSummaries,
    models: [...models],
    ...(hasUsage
      ? {
          tokens: {
            input: inputTokens,
            output: outputTokens,
            cacheRead: cacheReadTokens,
            cacheWrite: cacheWriteTokens,
            total: inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens,
          },
        }
      : {}),
    ...(hasCost ? { costUsd } : {}),
  };
}
