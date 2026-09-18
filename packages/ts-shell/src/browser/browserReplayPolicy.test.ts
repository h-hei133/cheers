import { describe, expect, it } from "vitest";
import { createBrowserActionCacheEntryFromReceipt } from "./browserActionCacheEntry.js";
import { decideBrowserReplayPolicy } from "./browserReplayPolicy.js";
import { safeReceipt } from "./browserActionCacheEntry.test.js";

describe("browser replay policy", () => {
  it("allows replay-ready local/test cache entries with current gates", () => {
    const result = createBrowserActionCacheEntryFromReceipt({ receipt: safeReceipt() });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const policy = decideBrowserReplayPolicy({
      entry: result.entry,
      runnerAvailable: true,
      sandboxConfirmed: true,
      allowlistConfirmed: true,
      confirmationRecorded: true,
    });

    expect(policy.status).toBe("replay-allowed");
    expect(policy.allowed).toBe(true);
  });

  it("blocks external, failed, or unsafe receipts", () => {
    const result = createBrowserActionCacheEntryFromReceipt({
      receipt: {
        ...safeReceipt(),
        status: "timed-out",
        executed: false,
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const policy = decideBrowserReplayPolicy({
      entry: result.entry,
      runnerAvailable: true,
      sandboxConfirmed: true,
      allowlistConfirmed: true,
      confirmationRecorded: true,
    });

    expect(policy.allowed).toBe(false);
    expect(policy.status).toBe("replay-blocked");
  });
});
