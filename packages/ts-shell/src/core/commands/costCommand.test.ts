import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runCostCommand } from "./costCommandRuntime.js";
import { recordSessionUsage, resetSessionUsage } from "../../observability/usageTelemetry.js";
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
});
