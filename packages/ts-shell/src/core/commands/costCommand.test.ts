import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runCostCommand } from "./costCommandRuntime.js";
import { recordSessionUsage, resetSessionUsage } from "../../observability/usageTelemetry.js";
import { writeCatalogCache } from "../models/catalogStore.js";
import type { CommandContext } from "./types.js";

/**
 * `/cost` renders one table per model.
 *
 * The defect this replaced: a session kept a single flat record whose model field
 * was overwritten each turn, so the newest model's rate was applied to every token
 * ever spent. The output looked entirely normal, which is what made it worse than
 * reporting nothing.
 */

const tempDirs: string[] = [];

function workspace(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cost-cmd-"));
  tempDirs.push(dir);
  return dir;
}

function contextFor(sessionId: string, cwd: string): CommandContext {
  return { cwd, sessionId } as CommandContext;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe("runCostCommand", () => {
  it("says there is nothing to count when nothing was recorded", async () => {
    const session = "sess_cost_empty";
    resetSessionUsage(session);
    const result = await runCostCommand([], contextFor(session, workspace()));
    expect(result.output).toContain("nothing to count");
  });

  it("names the model when only one answered", async () => {
    // The single-model output has to stay as it was: this change was about
    // attribution, not about reformatting the common case.
    const session = "sess_cost_one";
    resetSessionUsage(session);
    recordSessionUsage(session, { promptTokens: 1_000_000, completionTokens: 0, model: "solo" });

    const result = await runCostCommand([], contextFor(session, workspace()));
    expect(result.output).toContain("Model `solo`");
    expect(result.output).toContain("1,000,000 tokens");
    expect(result.output).toContain("**$0.1400**");
    // No session total row: with one model it would repeat the table's own total.
    expect(result.output).not.toContain("Session total");
  });

  it("gives each model its own table and totals them", async () => {
    const session = "sess_cost_two";
    resetSessionUsage(session);
    recordSessionUsage(session, { promptTokens: 1_000_000, completionTokens: 0, model: "cheap" });
    recordSessionUsage(session, { promptTokens: 2_000_000, completionTokens: 0, model: "dear" });

    const result = await runCostCommand([], contextFor(session, workspace()));
    expect(result.output).toContain("2 models");
    expect(result.output).toContain("**`cheap`**");
    expect(result.output).toContain("**`dear`**");
    // Each model's own figure, and the sum.
    expect(result.output).toContain("**$0.1400**");
    expect(result.output).toContain("**$0.2800**");
    expect(result.output).toContain("Session total: $0.4200");
    // The session-level token figure is the sum across buckets.
    expect(result.output).toContain("3,000,000 tokens");
  });

  it("does not apply one model's tokens to another's table", async () => {
    // Stated as the bug: the 9,000,000-token model must not carry the other's
    // figure, and vice versa. Written without assuming which section comes first,
    // because the ordering is alphabetical and not the point of this test.
    const session = "sess_cost_split";
    resetSessionUsage(session);
    recordSessionUsage(session, { promptTokens: 1_000_000, completionTokens: 0, model: "small" });
    recordSessionUsage(session, { promptTokens: 9_000_000, completionTokens: 0, model: "large" });

    const result = await runCostCommand([], contextFor(session, workspace()));
    const sections = result.output.split(/\*\*`(small|large)`\*\*/).filter(Boolean);
    // sections: ["...header...", "large", "...large body...", "small", "...small body..."]
    const bodyOf = (model: string): string => {
      const index = sections.indexOf(model);
      return sections[index + 1] ?? "";
    };
    expect(bodyOf("large")).toContain("9,000,000");
    expect(bodyOf("large")).not.toContain("1,000,000");
    expect(bodyOf("small")).toContain("1,000,000");
    expect(bodyOf("small")).not.toContain("9,000,000");
  });

  it("says the rates are estimates when no model publishes prices", async () => {
    // Every shipped model relies on the fallback today, so this is the normal
    // path and the wording has to be honest about it.
    const session = "sess_cost_rates";
    resetSessionUsage(session);
    recordSessionUsage(session, { promptTokens: 1_000, completionTokens: 0, model: "unpublished" });

    const result = await runCostCommand([], contextFor(session, workspace()));
    expect(result.output).toContain("estimates at a fixed fallback");
  });

  /**
   * The cache report is a comparison between one request and the one before it,
   * so what it can say depends on both being visible. The rates come from the
   * catalog, and a model with no published prices cannot have a cost computed for
   * it — so this publishes prices for one model to exercise the arithmetic.
   */
  it("reports prompt that was sent again and billed in full", async () => {
    const home = workspace();
    process.env.HOME = home;
    process.env.USERPROFILE = home;
    writeCatalogCache([
      {
        id: "priced",
        models: [{ id: "meter", cost: { promptPerMTok: 3, completionPerMTok: 15, cacheReadPerMTok: 0.3 } }],
      },
    ]);

    const session = "sess_cost_cache";
    resetSessionUsage(session);
    // Two requests of the same 100k prompt with nothing read from cache: the
    // second should have been a read, and was not.
    recordSessionUsage(session, { promptTokens: 99_999, cacheWriteTokens: 1, completionTokens: 0, model: "meter", provider: "priced" });
    recordSessionUsage(session, { promptTokens: 99_999, cacheWriteTokens: 1, completionTokens: 0, model: "meter", provider: "priced" });
    const result = await runCostCommand([], contextFor(session, workspace()));

    expect(result.output).toContain("Prompt cache hit rate: 0.0%");
    expect(result.output).toContain("Prompt cache");
    expect(result.output).toContain("100,000 prompt tokens");
    // 3.00 - 0.30 per million over 100k tokens.
    expect(result.output).toContain("$0.2700");
  });

  it("says nothing about the cache when every request reused it", async () => {
    const home = workspace();
    process.env.HOME = home;
    process.env.USERPROFILE = home;
    writeCatalogCache([
      {
        id: "priced",
        models: [{ id: "meter", cost: { promptPerMTok: 3, completionPerMTok: 15, cacheReadPerMTok: 0.3 } }],
      },
    ]);

    const session = "sess_cost_nocache";
    resetSessionUsage(session);
    recordSessionUsage(session, { promptTokens: 100_000, completionTokens: 0, model: "meter", provider: "priced" });
    recordSessionUsage(session, {
      promptTokens: 100_000,
      completionTokens: 0,
      model: "meter",
      provider: "priced",
      cacheReadTokens: 100_000,
    });

    const result = await runCostCommand([], contextFor(session, workspace()));
    // A heading with a zero under it would suggest the cache was doing badly,
    // when the truth is there was nothing to report.
    expect(result.output).not.toContain("Prompt cache");
  });

  /**
   * The headline figure sums two different things. Tokens a model switch re-sent
   * could never have been cache reads for the new model, so the report has to say
   * so rather than leaving a reader to conclude the cache failed.
   */
  it("says a model switch could not have been a cache read, not that it should have been", async () => {
    const home = workspace();
    process.env.HOME = home;
    process.env.USERPROFILE = home;
    writeCatalogCache([
      {
        id: "priced",
        models: [
          { id: "meter", cost: { promptPerMTok: 3, completionPerMTok: 15, cacheReadPerMTok: 0.3 } },
          { id: "other", cost: { promptPerMTok: 3, completionPerMTok: 15, cacheReadPerMTok: 0.3 } },
        ],
      },
    ]);

    const session = "sess_cost_switch";
    resetSessionUsage(session);
    recordSessionUsage(session, { promptTokens: 100_000, completionTokens: 0, model: "meter", provider: "priced" });
    recordSessionUsage(session, { promptTokens: 100_000, completionTokens: 0, model: "other", provider: "priced" });

    const result = await runCostCommand([], contextFor(session, workspace()));
    expect(result.output).toContain("Prompt cache");
    expect(result.output).toContain("could not have been cache reads at all");
    // And it is not also reported as an idle-gap failure, which is a different cause.
    expect(result.output).not.toContain("idle gap");
  });
});
