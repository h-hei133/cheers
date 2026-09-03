import type { CommandContext, LocalCommandResult } from "./types.js";
import { estimateUsageCost, getSessionUsage, USAGE_RATES } from "../../observability/usageTelemetry.js";

/**
 * /cost — tokens spent, and what they would cost at a fixed rate.
 *
 * The token counts are measured: they come from what the provider reported on each
 * completion. The money is not measured — the rate table is a constant that does
 * not vary by model — so it is labelled as an estimate and the rate is shown
 * beside it. Calling that column "Actual Cost", as it used to, presented a
 * multiplication by a guessed constant as a fact about a bill.
 */
export async function runCostCommand(
  _args: string[],
  context: CommandContext,
): Promise<LocalCommandResult> {
  const sessionId = context.sessionId ?? "";
  const telemetry = sessionId ? getSessionUsage(sessionId) : undefined;

  if (!telemetry || telemetry.totalTokens <= 0) {
    return {
      kind: "local",
      output: [
        "### Usage",
        "",
        "No completions have been recorded in this session yet, so there is nothing to count.",
      ].join("\n"),
    };
  }

  const promptCost = (telemetry.promptTokens / 1_000_000) * USAGE_RATES.promptPerMTok;
  const completionCost = (telemetry.completionTokens / 1_000_000) * USAGE_RATES.completionPerMTok;

  return {
    kind: "local",
    output: [
      "### Usage",
      "",
      `- Model \`${telemetry.model}\` · ${telemetry.turnsCount} ${telemetry.turnsCount === 1 ? "turn" : "turns"}`,
      `- ${telemetry.totalTokens.toLocaleString()} tokens reported by the provider`,
      "",
      "| | Tokens | Rate | Estimated |",
      "| :--- | ---: | ---: | ---: |",
      `| In | ${telemetry.promptTokens.toLocaleString()} | $${USAGE_RATES.promptPerMTok}/M | $${promptCost.toFixed(4)} |`,
      `| Out | ${telemetry.completionTokens.toLocaleString()} | $${USAGE_RATES.completionPerMTok}/M | $${completionCost.toFixed(4)} |`,
      `| **Total** | **${telemetry.totalTokens.toLocaleString()}** | | **$${estimateUsageCost(telemetry).toFixed(4)}** |`,
      "",
      "The token counts are what the provider reported. The money is an estimate at a fixed rate that does not follow the model in use — check your provider's billing for what was actually charged.",
    ].join("\n"),
  };
}
