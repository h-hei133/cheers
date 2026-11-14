import type { ExportAccounting, ExportEntry, ExportSessionStats, ExportTreeNode } from "./model.js";

/** Compute aggregate message, tool, model, token, and cost statistics for an export payload. */
export function computeExportStats(
  entries: readonly ExportEntry[],
  tree: readonly ExportTreeNode[],
  accounting: ExportAccounting,
): ExportSessionStats {
  let userMessages = 0;
  let assistantMessages = 0;
  let toolResults = 0;
  let commandOutputs = 0;
  let toolCalls = 0;
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
    accounting,
  };
}
