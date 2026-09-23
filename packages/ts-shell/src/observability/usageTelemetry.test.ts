import { afterEach, describe, expect, it } from "vitest";
import {
  estimateSessionCost,
  estimateUsageCost,
  getSessionUsage,
  recordSessionUsage,
  resetSessionUsage,
  totalTokens,
  usageBuckets,
  USAGE_RATES,
  type ModelCostRates,
} from "./usageTelemetry.js";

/**
 * Usage is bucketed by model.
 *
 * The defect this replaced: a session kept one flat record whose `model` field was
 * overwritten by each turn, so `/cost` applied the newest model's rate to every
 * token the session had ever spent. The counts were measured correctly and then
 * attributed to the wrong model, which is worse than reporting nothing — it looks
 * like a measurement.
 */

const SESSION = "sess_bucket_test";

afterEach(() => resetSessionUsage(SESSION));

describe("bucketing", () => {
  it("keeps each model's tokens under its own bucket", () => {
    recordSessionUsage(SESSION, { promptTokens: 100, completionTokens: 10, model: "cheap" });
    recordSessionUsage(SESSION, { promptTokens: 200, completionTokens: 20, model: "dear" });

    const telemetry = getSessionUsage(SESSION);
    expect(telemetry.byModel.cheap?.promptTokens).toBe(100);
    expect(telemetry.byModel.dear?.promptTokens).toBe(200);
    // The session total is the sum, not the latest model's figure.
    expect(totalTokens(telemetry)).toBe(330);
  });

  it("counts repeated turns under the same model together", () => {
    recordSessionUsage(SESSION, { promptTokens: 100, completionTokens: 0, model: "m" });
    recordSessionUsage(SESSION, { promptTokens: 100, completionTokens: 0, model: "m" });

    const telemetry = getSessionUsage(SESSION);
    expect(telemetry.byModel.m?.promptTokens).toBe(200);
    expect(telemetry.byModel.m?.turnsCount).toBe(2);
  });

  it("does not lose the earlier model's tokens when the model changes", () => {
    // The exact regression: the second call must not overwrite the first.
    recordSessionUsage(SESSION, { promptTokens: 1_000_000, completionTokens: 0, model: "first" });
    recordSessionUsage(SESSION, { promptTokens: 1_000_000, completionTokens: 0, model: "second" });

    const telemetry = getSessionUsage(SESSION);
    expect(telemetry.byModel.first?.promptTokens).toBe(1_000_000);
    expect(telemetry.byModel.second?.promptTokens).toBe(1_000_000);
  });

  it("falls back to the last known model when a call does not name one", () => {
    recordSessionUsage(SESSION, { promptTokens: 10, completionTokens: 0, model: "named" });
    recordSessionUsage(SESSION, { promptTokens: 10, completionTokens: 0 });

    const telemetry = getSessionUsage(SESSION);
    expect(Object.keys(telemetry.byModel)).toEqual(["named"]);
    expect(telemetry.byModel.named?.promptTokens).toBe(20);
  });

  it("keeps the context gauge session-level, not per model", () => {
    // The gauge describes the conversation, not the model that last read it.
    recordSessionUsage(SESSION, { promptTokens: 500, promptMessageCount: 7, model: "m" });
    const telemetry = getSessionUsage(SESSION);
    expect(telemetry.lastPromptTokens).toBe(500);
    expect(telemetry.lastPromptMessageCount).toBe(7);
  });

  it("keeps cache tokens with the model that reported them", () => {
    recordSessionUsage(SESSION, { promptTokens: 1, cacheReadTokens: 90, model: "a" });
    recordSessionUsage(SESSION, { promptTokens: 1, cacheReadTokens: 5, model: "b" });

    const telemetry = getSessionUsage(SESSION);
    expect(telemetry.byModel.a?.cacheReadTokens).toBe(90);
    expect(telemetry.byModel.b?.cacheReadTokens).toBe(5);
  });
});

describe("estimateSessionCost", () => {
  it("prices each model at its own rate", () => {
    // One million prompt tokens at $1/M and one at $10/M is $11, not $20 and not $2.
    recordSessionUsage(SESSION, { promptTokens: 1_000_000, completionTokens: 0, model: "cheap" });
    recordSessionUsage(SESSION, { promptTokens: 1_000_000, completionTokens: 0, model: "dear" });

    const rates: Record<string, ModelCostRates> = {
      cheap: { promptPerMTok: 1, completionPerMTok: 0 },
      dear: { promptPerMTok: 10, completionPerMTok: 0 },
    };
    const { cost, everyRatePublished } = estimateSessionCost(getSessionUsage(SESSION), (model) => rates[model]);
    expect(cost).toBeCloseTo(11, 6);
    expect(everyRatePublished).toBe(true);
  });

  it("says so when a model publishes no rates", () => {
    // The caller has to be able to tell an estimate from a measurement.
    recordSessionUsage(SESSION, { promptTokens: 1_000_000, completionTokens: 0, model: "unknown" });
    const { everyRatePublished } = estimateSessionCost(getSessionUsage(SESSION), () => undefined);
    expect(everyRatePublished).toBe(false);
  });

  it("does not let one model's rate leak into another's tokens", () => {
    // The regression stated as a number: the dear model's rate applied to the
    // cheap model's tokens would give $20 instead of $11.
    recordSessionUsage(SESSION, { promptTokens: 1_000_000, completionTokens: 0, model: "cheap" });
    recordSessionUsage(SESSION, { promptTokens: 1_000_000, completionTokens: 0, model: "dear" });

    const { cost } = estimateSessionCost(getSessionUsage(SESSION), (model) =>
      model === "cheap" ? { promptPerMTok: 1, completionPerMTok: 0 } : { promptPerMTok: 10, completionPerMTok: 0 },
    );
    expect(cost).not.toBeCloseTo(20, 6);
    expect(cost).not.toBeCloseTo(2, 6);
    expect(cost).toBeCloseTo(11, 6);
  });

  it("uses the fallback rate for a model with no published prices", () => {
    recordSessionUsage(SESSION, { promptTokens: 1_000_000, completionTokens: 0, model: "m" });
    const { cost } = estimateSessionCost(getSessionUsage(SESSION), () => undefined);
    expect(cost).toBeCloseTo(USAGE_RATES.promptPerMTok, 6);
  });
});

describe("usageBuckets", () => {
  it("lists buckets in a stable order", () => {
    // Object key order is not a promise; the output has to read the same twice.
    recordSessionUsage(SESSION, { promptTokens: 1, completionTokens: 0, model: "zeta" });
    recordSessionUsage(SESSION, { promptTokens: 1, completionTokens: 0, model: "alpha" });
    expect(usageBuckets(getSessionUsage(SESSION)).map(([model]) => model)).toEqual(["alpha", "zeta"]);
  });

  it("is empty for a session that has recorded nothing", () => {
    expect(usageBuckets(getSessionUsage("sess_never_used"))).toEqual([]);
    expect(totalTokens(getSessionUsage("sess_never_used"))).toBe(0);
  });
});

describe("estimateUsageCost", () => {
  it("prices a single bucket", () => {
    const cost = estimateUsageCost(
      { promptTokens: 1_000_000, completionTokens: 0, totalTokens: 1_000_000, cacheReadTokens: 0, cacheWriteTokens: 0, turnsCount: 1 },
      { promptPerMTok: 3, completionPerMTok: 5 },
    );
    expect(cost).toBeCloseTo(3, 6);
  });
});
