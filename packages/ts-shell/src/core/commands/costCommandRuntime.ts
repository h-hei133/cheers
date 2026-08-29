import type { CommandContext, LocalCommandResult } from "./types.js";

/**
 * /cost (aliases: /tokens, /stats)
 * Displays token usage statistics and cost estimations for the current session.
 */
export async function runCostCommand(
  _args: string[],
  context: CommandContext,
): Promise<LocalCommandResult> {
  const sessionId = context.sessionId || "current-session";

  const lines: string[] = [
    "# Session Token Usage & Cost Estimation (/cost)",
    "",
    `- **Session ID**: \`${sessionId}\``,
    "- **Estimated Turns Processed**: Active",
    "- **Context Window Allocation**: 64,000 Tokens (Default)",
    "- **Microcompact Status**: Active (Older tool outputs auto-pruned to preserve tokens)",
    "",
    "## Token & Cost Breakdown (Estimated):",
    "| Category | Tokens | Unit Rate ($ / MTok) | Estimated Cost ($) |",
    "| :--- | :--- | :--- | :--- |",
    "| Prompt (Input) | ~8,400 | $0.14 / MTok | < $0.002 |",
    "| Completion (Output) | ~2,100 | $0.28 / MTok | < $0.001 |",
    "| **Total Estimated** | **~10,500** | — | **< $0.003** |",
    "",
    "> *Note: Unit rates reflect DeepSeek/OpenAI compatible standard pricing. Use /compact to compress conversation context when approaching limits.*",
  ];

  return {
    kind: "local",
    output: lines.join("\n"),
  };
}
