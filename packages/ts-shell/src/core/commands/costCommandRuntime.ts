import type { CommandContext, LocalCommandResult } from "./types.js";
import { estimateUsageCost, getSessionUsage, USAGE_RATES } from "../../observability/usageTelemetry.js";

/**
 * /cost (aliases: /tokens, /stats)
 * Displays real-time live token usage statistics and cost estimations for the active session.
 */
export async function runCostCommand(
  _args: string[],
  context: CommandContext,
): Promise<LocalCommandResult> {
  const sessionId = context.sessionId || "current-session";
  const telemetry = getSessionUsage(sessionId);

  const promptCost = (telemetry.promptTokens / 1_000_000) * USAGE_RATES.promptPerMTok;
  const completionCost = (telemetry.completionTokens / 1_000_000) * USAGE_RATES.completionPerMTok;
  const totalCost = estimateUsageCost(telemetry);

  const lines: string[] = [
    "# 💰 Session Live Token Usage & Cost Accounting (/cost)",
    "",
    `- **Session ID**: \`${sessionId}\``,
    `- **Active Model**: \`${telemetry.model}\``,
    `- **Turns Completed**: ${telemetry.turnsCount}`,
    `- **Total Tokens Consumed**: ${telemetry.totalTokens.toLocaleString()} Tokens`,
    "",
    "## Live Token & Cost Breakdown:",
    "| Category | Actual Tokens | Unit Rate ($ / MTok) | Actual Cost ($) |",
    "| :--- | :--- | :--- | :--- |",
    `| **Prompt (Input)** | ${telemetry.promptTokens.toLocaleString()} | $${USAGE_RATES.promptPerMTok} / MTok | $${promptCost.toFixed(5)} |`,
    `| **Completion (Output)** | ${telemetry.completionTokens.toLocaleString()} | $${USAGE_RATES.completionPerMTok} / MTok | $${completionCost.toFixed(5)} |`,
    `| **Total Incurred** | **${telemetry.totalTokens.toLocaleString()}** | — | **$${totalCost.toFixed(5)}** |`,
    "",
    "> *Note: Real-time token telemetry recorded directly from provider completions API. Unit rates based on DeepSeek / OpenAI compatible standard tier.*",
  ];

  return {
    kind: "local",
    output: lines.join("\n"),
  };
}
