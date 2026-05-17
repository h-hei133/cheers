import { describe, expect, it } from "vitest";
import { createBrowserActionCache } from "./browserActionCache.js";
import { createBrowserNetworkAllowlist } from "./browserNetworkAllowlist.js";
import { createBrowserSandboxAuthority } from "./browserSandboxAuthority.js";
import { FakeBrowserExecutor } from "./browserExecutor.js";
import { runBrowserReplayCommand } from "./browserReplayCommandRunner.js";
import { safeReceipt } from "./browserActionCacheEntry.test.js";

describe("browser replay command runner", () => {
  it("renders replay status and explicit replay output", async () => {
    const cache = createBrowserActionCache();
    const receipt = safeReceipt();
    cache.addReceipt(receipt);

    const status = await runBrowserReplayCommand({
      request: { mode: "status", sourceCommand: "/browser replay" },
      actionCache: cache,
    });
    expect(status.output).toContain("Cache status: available");
    expect(status.output).toContain("Persistence: none");

    const replay = await runBrowserReplayCommand({
      request: { mode: "replay", receiptId: receipt.receiptId, sourceCommand: "/browser replay" },
      actionCache: cache,
      executor: new FakeBrowserExecutor(),
      sandboxAuthority: createBrowserSandboxAuthority({ mode: "fake-test" }),
      networkAllowlist: createBrowserNetworkAllowlist(),
      confirmations: [{ kind: "sandbox", status: "confirmed" }],
    });

    expect(replay.output).toContain("Browser replay");
    expect(replay.output).toContain("Executed: yes");
    expect(replay.output).toContain("New receipt id:");
  });
});
