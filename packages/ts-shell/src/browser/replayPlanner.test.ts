import { describe, expect, it } from "vitest";
import { createBrowserActionCacheEntryFromReceipt } from "./actionCacheEntry.js";
import { planBrowserReplay } from "./replayPlanner.js";
import { safeReceipt } from "./actionCacheEntry.test.js";

describe("browser replay planner", () => {
  it("builds a replay execution request only after policy revalidation", () => {
    const result = createBrowserActionCacheEntryFromReceipt({ receipt: safeReceipt() });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const plan = planBrowserReplay({
      entry: result.entry,
      runnerAvailable: true,
      sandboxConfirmed: true,
      allowlistConfirmed: true,
      confirmationRecorded: true,
    });

    expect(plan.willExecute).toBe(true);
    expect(plan.request?.requestId).toContain("browser-replay:");
    expect(plan.evidence).toContain("browser-replay-planner:revalidated-before-execution");
  });
});
