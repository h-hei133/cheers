import type { CommandContext, LocalCommandResult } from "./types.js";
import {
  estimateSessionCost,
  estimateUsageCost,
  getSessionUsage,
  totalTokens,
  splitBucketKey,
  usageBuckets,
  USAGE_RATES,
  type ModelUsageBucket,
} from "../../observability/usageTelemetry.js";
import type { ModelCostRates } from "../models/catalog.js";
import { CACHE_TTL_MS, findCacheWaste, summarizeCacheUsage } from "../../observability/cacheWaste.js";
import { loadCatalog } from "../models/catalogStore.js";
import type { SessionUsageTelemetry } from "../../observability/usageTelemetry.js";
import { resolveModelCost } from "../models/window.js";

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
 *
 * Rates are resolved per model, not once for the session. A session that switched
 * models partway through spent tokens at two different prices, and applying the
 * newest model's rate to all of them reports an amount nobody would be billed —
 * which is worse than reporting nothing, because it looks like a measurement.
 */
export async function runCostCommand(
  _args: string[],
  context: CommandContext,
): Promise<LocalCommandResult> {
  const sessionId = context.sessionId ?? "";
  const telemetry = sessionId ? getSessionUsage(sessionId) : undefined;
  const buckets = telemetry ? usageBuckets(telemetry) : [];
  const grandTotal = telemetry ? totalTokens(telemetry) : 0;

  if (!telemetry || grandTotal <= 0) {
    return {
      kind: "local",
      output: [
        "### Usage",
        "",
        "No completions have been recorded in this session yet, so there is nothing to count.",
      ].join("\n"),
    };
  }

  // The provider each bucket was recorded under, not the one active now. Resolving
  // against the current provider repriced every earlier bucket on a switch: a model
  // id two providers both serve costs different amounts, and the tokens were spent
  // at the earlier provider's rate.
  const catalog = loadCatalog();
  const rateFor = (provider: string, model: string): ModelCostRates | undefined =>
    resolveModelCost(catalog, provider, model);
  const { cost: sessionCost, everyRatePublished } = estimateSessionCost(telemetry, rateFor);
  const sections = buckets.map(([key, bucket]) => {
    const { provider, model } = splitBucketKey(key);
    const published = rateFor(provider, model);
    const rates: ModelCostRates = published ?? USAGE_RATES;
    return renderModelSection({
      model,
      bucket,
      rates,
      cost: estimateUsageCost(bucket, rates),
      published: published !== undefined,
      // With one model there is nothing to distinguish, so the heading would be
      // noise. With several it is the whole point.
      showHeading: buckets.length > 1,
    });
  });

  return {
    kind: "local",
    output: [
      "### Usage",
      "",
      // Named when there is one model, counted when there are several: the name is
      // the useful fact in the first case and the count is in the second.
      buckets.length === 1
        ? `- Model \`${buckets[0]![0]}\` · ${telemetry.turnsCount} ${telemetry.turnsCount === 1 ? "turn" : "turns"}`
        : `- ${buckets.length} models · ${telemetry.turnsCount} ${telemetry.turnsCount === 1 ? "turn" : "turns"}`,
      `- ${grandTotal.toLocaleString()} tokens reported by the provider`,
      "",
      ...sections,
      ...(buckets.length > 1
        ? [`**Session total: $${sessionCost.toFixed(4)}**`, ""]
        : []),
      everyRatePublished
        ? "The token counts are what the provider reported. The rates are the ones each model publishes."
        // "Some" rather than "the": with several models, one of them may publish
        // prices while another does not, so a flat statement would be wrong for
        // at least one table above it.
        : "The token counts are what the provider reported. Some rates are estimates at a fixed fallback that does not follow the model in use — check your provider's billing for what was actually charged.",
      ...cacheWasteSection(telemetry, rateFor),
    ].join("\n"),
  };
}

/**
 * What the prompt cache did not save, over the requests still held.
 *
 * Says nothing when there is nothing to say: a session with no counted miss, or
 * one where no request could be judged, has no cache story and a heading with a
 * zero under it would suggest otherwise.
 *
 * The window is named because it is genuinely bounded — the history keeps the
 * recent requests, not every one — and a figure presented without that would read
 * as the session's total.
 */
function cacheWasteSection(
  telemetry: SessionUsageTelemetry,
  rateFor: (provider: string, model: string) => ModelCostRates | undefined,
): readonly string[] {
  const report = findCacheWaste(telemetry.recentRequests, rateFor);
  if (report.totals.missCount === 0) return [];

  const { missedTokens, missedCost, missCount } = report.totals;
  // Named because the headline figure is not all one kind of thing: tokens a
  // model switch re-sent could never have been read from a cache for the new
  // model, so the sum is real spend but not all of it is avoidable. Saying
  // "would have been cache reads" over the total would claim otherwise.
  const switched = report.misses.filter((miss) => miss.modelChanged).length;
  const lines = [
    "",
    "### Prompt cache",
    "",
    `- Prompt cache hit rate: ${renderCacheHitRate(telemetry.recentRequests)}`,
    `- ${missedTokens.toLocaleString()} prompt tokens were sent again and billed in full, across ${missCount} ${missCount === 1 ? "request" : "requests"}`,
    `- Of those, an estimated $${missedCost.toFixed(4)} extra was spent against what a cache read would have cost`,
    ...(switched > 0
      ? [
          `- ${switched} of them followed a model change, which re-bills the prompt by design — those could not have been cache reads at all`,
        ]
      : []),
  ];

  // Named separately because the remedy differs: an idle gap is fixed by asking
  // sooner, and a model switch is not a cache failure.
  const idled = report.misses.filter((miss) => miss.idleMs > CACHE_TTL_MS).length;
  if (idled > 0) {
    lines.push(
      `- ${idled} of them followed an idle gap longer than ${Math.round(CACHE_TTL_MS / 60000)} minutes, which is long enough for a cache to expire`,
    );
  }

  lines.push(
    "",
    `Counted over the last ${telemetry.recentRequests.length} requests of this session, not the whole of it.`,
  );
  return lines;
}

/** One model's table, with the total row. */
function renderCacheHitRate(history: readonly import("../../observability/usageTelemetry.js").UsageHistoryEntry[]): string {
  const accounted = summarizeCacheUsage(history);
  return accounted.hitRate === undefined ? "unknown" : `${accounted.hitRate.toFixed(1)}%`;
}

function renderModelSection(input: {
  readonly model: string;
  readonly bucket: ModelUsageBucket;
  readonly rates: ModelCostRates;
  readonly cost: number;
  readonly published: boolean;
  readonly showHeading: boolean;
}): string {
  const { bucket, rates } = input;
  const rows = [
    `| In | ${bucket.promptTokens.toLocaleString()} | $${rates.promptPerMTok}/M | $${((bucket.promptTokens / 1_000_000) * rates.promptPerMTok).toFixed(4)} |`,
    `| Out | ${bucket.completionTokens.toLocaleString()} | $${rates.completionPerMTok}/M | $${((bucket.completionTokens / 1_000_000) * rates.completionPerMTok).toFixed(4)} |`,
  ];
  // Only shown when the provider reported any: a row of zeroes would suggest the
  // cache is being tracked for a model that never mentioned it.
  if (bucket.cacheReadTokens > 0 || bucket.cacheWriteTokens > 0) {
    const readRate = rates.cacheReadPerMTok;
    const writeRate = rates.cacheWritePerMTok;
    rows.push(
      `| Cache read | ${bucket.cacheReadTokens.toLocaleString()} | ${readRate === undefined ? "—" : `$${readRate}/M`} | ${readRate === undefined ? "—" : `$${((bucket.cacheReadTokens / 1_000_000) * readRate).toFixed(4)}`} |`,
      `| Cache write | ${bucket.cacheWriteTokens.toLocaleString()} | ${writeRate === undefined ? "—" : `$${writeRate}/M`} | ${writeRate === undefined ? "—" : `$${((bucket.cacheWriteTokens / 1_000_000) * writeRate).toFixed(4)}`} |`,
    );
  }
  const heading = input.showHeading
    ? [`**\`${input.model}\`** — ${bucket.turnsCount} ${bucket.turnsCount === 1 ? "turn" : "turns"}${input.published ? "" : " (estimated rate)"}`, ""]
    : [];
  return [
    ...heading,
    "| | Tokens | Rate | Estimated |",
    "| :--- | ---: | ---: | ---: |",
    ...rows,
    `| **Total** | **${bucket.totalTokens.toLocaleString()}** | | **$${input.cost.toFixed(4)}** |`,
    "",
  ].join("\n");
}
