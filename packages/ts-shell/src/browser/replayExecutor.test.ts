import { describe, expect, it } from "vitest";
import { createBrowserActionCache } from "./actionCache.js";
import { createBrowserNetworkAllowlist } from "./networkAllowlist.js";
import { createBrowserSandboxAuthority } from "./sandboxAuthority.js";
import { FakeBrowserExecutor } from "./executor.js";
import { executeBrowserReplay } from "./replayExecutor.js";
import { planBrowserReplay } from "./replayPlanner.js";
import { safeReceipt } from "./actionCacheEntry.test.js";

describe("browser replay executor", () => {
  it("creates a linked replay receipt for explicit allowed replay", async () => {
    const cache = createBrowserActionCache();
    const receipt = safeReceipt();
    cache.addReceipt(receipt);
    const entry = cache.get(receipt.receiptId);
    const plan = planBrowserReplay({
      entry,
      runnerAvailable: true,
      sandboxConfirmed: true,
      allowlistConfirmed: true,
      confirmationRecorded: true,
    });

    const result = await executeBrowserReplay({
      plan,
      executor: new FakeBrowserExecutor(),
      sourceReceipt: receipt,
      sandboxAuthority: createBrowserSandboxAuthority({ mode: "fake-test" }),
      networkAllowlist: createBrowserNetworkAllowlist(),
    });

    expect(result.executed).toBe(true);
    expect(result.receipt?.source).toBe("replay");
    expect(result.receipt?.replaySourceReceiptId).toBe(receipt.receiptId);
    expect(result.receipt?.replayCacheEntryId).toBe(entry?.entryId);
  });

  it("blocks replay execution when current runtime preflight fails", async () => {
    const cache = createBrowserActionCache();
    const receipt = safeReceipt();
    cache.addReceipt(receipt);
    const entry = cache.get(receipt.receiptId);
    const plan = planBrowserReplay({
      entry,
      runnerAvailable: true,
      sandboxConfirmed: true,
      allowlistConfirmed: true,
      confirmationRecorded: true,
    });

    const result = await executeBrowserReplay({
      plan,
      executor: new FakeBrowserExecutor(),
      sourceReceipt: receipt,
      sandboxAuthority: createBrowserSandboxAuthority({ mode: "disabled" }),
      networkAllowlist: createBrowserNetworkAllowlist(),
    });

    expect(result.executed).toBe(false);
    expect(result.evidence).toContain("browser-replay-executor:preflight-blocked");
    expect(result.blockers.join("\n")).toContain("Browser sandbox authority is not enabled");
  });
});
