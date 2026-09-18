import { describe, expect, it } from "vitest";
import { createBrowserActionCache } from "./browserActionCache.js";
import { createBrowserNetworkAllowlist } from "./browserNetworkAllowlist.js";
import { createBrowserReceiptCacheManifest } from "./receipt/browserReceiptCacheManifest.js";
import { createBrowserReceiptCacheStore } from "./receipt/browserReceiptCacheStore.js";
import { createBrowserSandboxAuthority } from "./browserSandboxAuthority.js";
import { FakeBrowserExecutor } from "./browserExecutor.js";
import { runBrowserReplayCommand } from "./browserReplayCommandRunner.js";
import { safeReceipt } from "./browserActionCacheEntry.test.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

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

  it("reads explicit persistent cache records and blocks deleted records", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "browser-replay-command-cache-"));
    try {
      const store = createBrowserReceiptCacheStore({
        manifest: createBrowserReceiptCacheManifest({
          cacheRoot: root,
          allowedOperations: ["read", "write", "delete"],
        }),
      });
      const receipt = safeReceipt();
      expect(store.writeReceipt(receipt).written).toBe(true);

      const replay = await runBrowserReplayCommand({
        request: { mode: "replay", receiptId: receipt.receiptId, sourceCommand: "/browser replay" },
        receiptCacheStore: createBrowserReceiptCacheStore({ manifest: store.manifest }),
        executor: new FakeBrowserExecutor(),
        sandboxAuthority: createBrowserSandboxAuthority({ mode: "fake-test" }),
        networkAllowlist: createBrowserNetworkAllowlist(),
        confirmations: [{ kind: "sandbox", status: "confirmed" }],
      });

      expect(replay.output).toContain("Executed: yes");
      expect(replay.output).toContain("Cache source: persistent");

      store.delete(receipt.receiptId, "test delete");
      const deleted = await runBrowserReplayCommand({
        request: { mode: "replay", receiptId: receipt.receiptId, sourceCommand: "/browser replay" },
        receiptCacheStore: store,
        executor: new FakeBrowserExecutor(),
        sandboxAuthority: createBrowserSandboxAuthority({ mode: "fake-test" }),
        networkAllowlist: createBrowserNetworkAllowlist(),
        confirmations: [{ kind: "sandbox", status: "confirmed" }],
      });
      expect(deleted.output).toContain("Outcome: blocked");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
