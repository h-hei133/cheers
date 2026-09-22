import type { CommandContext, LocalCommandResult } from "./types.js";
import { estimateUsageCost, getSessionUsage, USAGE_RATES } from "../../observability/usageTelemetry.js";
import type { ModelCostRates } from "../models/catalog.js";
import { loadCatalog } from "../models/catalogStore.js";
import { resolveModelCost } from "../models/window.js";
import { resolveProviderCredential } from "../shell/providerCredentials.js";
import { getRuntimeConfig } from "../../config/runtimeConfig.js";

/**
 * /cost — tokens spent, and what they would cost.
 *
 * The token counts are measured: they come from what the provider reported on each
 * completion, including how much of the prompt it served from its cache. The money
 * is an estimate, and how good an estimate depends on whether the model publishes
 * its prices. When it does, those rates are used and the output says so; when it
 * does not, the fallback constants are used and the output says *that*. The two
 * must not look alike: a number derived from a real price list and a number
 * derived from a guess are not the same claim.
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

  // Resolved the same way the engine does, so the rate applied here is the rate
  // for the model that actually answered — not for whichever model the session
  // happens to be pointing at now.
  const active = resolveProviderCredential({ runtimeConfig: getRuntimeConfig(context.cwd) });
  const published = resolveModelCost(loadCatalog(), active.provider, telemetry.model);
  const rates: ModelCostRates = published ?? USAGE_RATES;
  const promptCost = (telemetry.promptTokens / 1_000_000) * rates.promptPerMTok;
  const completionCost = (telemetry.completionTokens / 1_000_000) * rates.completionPerMTok;

  const rows = [
    `| In | ${telemetry.promptTokens.toLocaleString()} | $${rates.promptPerMTok}/M | $${promptCost.toFixed(4)} |`,
    `| Out | ${telemetry.completionTokens.toLocaleString()} | $${rates.completionPerMTok}/M | $${completionCost.toFixed(4)} |`,
  ];
  // Only shown when the provider reported any: a row of zeroes would suggest the
  // cache is being tracked for a model that never mentioned it.
  if (telemetry.cacheReadTokens > 0 || telemetry.cacheWriteTokens > 0) {
    const readRate = rates.cacheReadPerMTok;
    const writeRate = rates.cacheWritePerMTok;
    rows.push(
      `| Cache read | ${telemetry.cacheReadTokens.toLocaleString()} | ${readRate === undefined ? "—" : `$${readRate}/M`} | ${readRate === undefined ? "—" : `$${((telemetry.cacheReadTokens / 1_000_000) * readRate).toFixed(4)}`} |`,
      `| Cache write | ${telemetry.cacheWriteTokens.toLocaleString()} | ${writeRate === undefined ? "—" : `$${writeRate}/M`} | ${writeRate === undefined ? "—" : `$${((telemetry.cacheWriteTokens / 1_000_000) * writeRate).toFixed(4)}`} |`,
    );
  }

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
      ...rows,
      `| **Total** | **${telemetry.totalTokens.toLocaleString()}** | | **$${estimateUsageCost(telemetry, rates).toFixed(4)}** |`,
      "",
      published
        ? `The token counts are what the provider reported. The rates are the ones \`${telemetry.model}\` publishes.`
        : "The token counts are what the provider reported. The money is an estimate at a fixed rate that does not follow the model in use — check your provider's billing for what was actually charged.",
    ].join("\n"),
  };
}
