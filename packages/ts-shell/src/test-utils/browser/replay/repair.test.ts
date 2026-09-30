import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createBrowserActionCache } from "../../../browser/actionCache.js";
import { createBrowserActionCacheEntryFromReceipt, type BrowserActionCacheEntry } from "../../../browser/actionCacheEntry.js";
import { safeReceipt } from "../../../browser/actionCacheEntry.test.js";
import { createBrowserReceiptCacheManifest } from "../../../browser/receipt/manifest.js";
import { createBrowserReceiptCacheStore } from "../../../browser/receipt/store.js";
import { FakeBrowserExecutor, NOOP_BROWSER_EXECUTOR } from "../../../browser/executor.js";
import { createBrowserNetworkAllowlist } from "../../../browser/networkAllowlist.js";
import { runBrowserReplayCommand } from "../../../browser/replayCommandRunner.js";
import { createBrowserSandboxAuthority } from "../../../browser/sandboxAuthority.js";
import { createBrowserReplayScenarioFixture, type BrowserReplayScenarioFixture } from "./fixtures.js";

describe("browser replay repair scenario examples", () => {
  const fixtures: BrowserReplayScenarioFixture[] = [];
  const tempRoots: string[] = [];

  afterEach(() => {
    for (const fixture of fixtures.splice(0)) {
      fixture.cleanup();
    }
    for (const root of tempRoots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("shows repair-needs-runner for missing current runner", async () => {
    const cache = createBrowserActionCache();
    const entry = entryFor();
    cache.add(entry);

    const result = await runBrowserReplayCommand({
      request: { mode: "replay", receiptId: entry.sourceReceiptId, sourceCommand: "/browser replay" },
      actionCache: cache,
    });

    expect(result.output).toContain("Repair readiness: repair-needs-runner");
    expect(result.output).toContain("Repair applied: no");
  });

  it("shows repair-needs-metadata for skill-managed replay without metadata", async () => {
    const cache = createBrowserActionCache();
    const entry = entryFor({
      executionMode: "skill-managed",
      runnerSource: "skill-managed",
      skillRunnerId: undefined,
      skillRunnerStatus: undefined,
      bindingRef: undefined,
    });
    cache.add(entry);

    const result = await runBrowserReplayCommand({
      request: { mode: "replay", receiptId: entry.sourceReceiptId, sourceCommand: "/browser replay" },
      actionCache: cache,
      executor: NOOP_BROWSER_EXECUTOR,
      sandboxAuthority: createBrowserSandboxAuthority({ mode: "local-fixture" }),
      networkAllowlist: createBrowserNetworkAllowlist(),
      confirmations: [{ kind: "sandbox", status: "confirmed" }],
    });

    expect(result.output).toContain("Repair readiness: repair-needs-metadata");
  });

  it("shows repair-needs-confirmation when current gates are missing", async () => {
    const fixture = track(createBrowserReplayScenarioFixture({ kind: "external-runner" }));
    fixture.seed(safeReceipt());

    const result = await runBrowserReplayCommand({
      request: { mode: "replay", receiptId: safeReceipt().receiptId, sourceCommand: "/browser replay" },
      actionCache: fixture.actionCache,
      executor: fixture.bridge.browserExecutor,
      sandboxAuthority: fixture.bridge.browserSandboxAuthority,
      networkAllowlist: fixture.bridge.browserNetworkAllowlist,
      confirmations: [],
    });

    expect(result.output).toContain("Repair readiness: repair-needs-confirmation");
  });

  it("shows repair-needs-cache-repair for corrupted persistent cache", async () => {
    const root = tempRoot();
    fs.writeFileSync(path.join(root, "browser-receipt-cache.jsonl"), "not-json\n", "utf8");
    const store = createBrowserReceiptCacheStore({
      manifest: createBrowserReceiptCacheManifest({ cacheRoot: root }),
    });

    const result = await runBrowserReplayCommand({
      request: { mode: "replay", receiptId: "missing", sourceCommand: "/browser replay" },
      receiptCacheStore: store,
    });

    expect(result.output).toContain("Repair readiness: repair-needs-cache-repair");
    expect(result.output).not.toContain("not-json");
  });

  it("shows blocked repair previews for unsafe evidence and external URLs", async () => {
    const unsafe = await replayWithEntry(entryFor({
      replayReadinessSnapshot: {
        ...entryFor().replayReadinessSnapshot,
        status: "replay-unsafe",
        reasons: ["unsafe"],
      },
    }));
    const external = await replayWithEntry(entryFor({ safeUrl: "https://example.com", fixtureId: "external:example" }));

    expect(unsafe.output).toContain("Repair readiness: repair-blocked-unsafe");
    expect(external.output).toContain("Repair readiness: repair-blocked-external-network");
  });

  it("shows repair-ready-preview for timeout and malformed local/test results", async () => {
    const timeout = await replayWithEntry(entryFor({ sourceReceiptStatus: "timed-out" }));
    const malformed = await replayWithEntry(entryFor({ sourceReceiptStatus: "invalid-response" }));

    expect(timeout.output).toContain("Repair readiness: repair-ready-preview");
    expect(malformed.output).toContain("Repair readiness: repair-ready-preview");
  });

  it("successful replay says repair needed no", async () => {
    const fixture = track(createBrowserReplayScenarioFixture({ kind: "external-runner" }));
    const receipt = safeReceipt();
    fixture.seed(receipt);

    const result = await runBrowserReplayCommand({
      request: { mode: "replay", receiptId: receipt.receiptId, sourceCommand: "/browser replay" },
      actionCache: fixture.actionCache,
      executor: fixture.bridge.browserExecutor,
      sandboxAuthority: fixture.bridge.browserSandboxAuthority,
      networkAllowlist: fixture.bridge.browserNetworkAllowlist,
      confirmations: fixture.bridge.browserExecutionConfirmations,
      cliExecutionBridgeSummary: fixture.bridge.browserCliExecutionBridgeSummary,
    });

    expect(result.output).toContain("Executed: yes");
    expect(result.output).toContain("Repair needed: no");
    expect(result.output).not.toContain("Browser replay repair preview");
  });

  async function replayWithEntry(entry: BrowserActionCacheEntry) {
    const cache = createBrowserActionCache();
    cache.add(entry);
    return runBrowserReplayCommand({
      request: { mode: "replay", receiptId: entry.sourceReceiptId, sourceCommand: "/browser replay" },
      actionCache: cache,
      executor: new FakeBrowserExecutor(),
      sandboxAuthority: createBrowserSandboxAuthority({ mode: "local-fixture" }),
      networkAllowlist: createBrowserNetworkAllowlist(),
      confirmations: [{ kind: "sandbox", status: "confirmed" }],
    });
  }

  function entryFor(overrides: Partial<BrowserActionCacheEntry> = {}): BrowserActionCacheEntry {
    const result = createBrowserActionCacheEntryFromReceipt({ receipt: safeReceipt() });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("entry failed");
    }
    return { ...result.entry, ...overrides };
  }

  function track<T extends BrowserReplayScenarioFixture>(fixture: T): T {
    fixtures.push(fixture);
    return fixture;
  }

  function tempRoot(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "browser-replay-repair-"));
    tempRoots.push(root);
    return root;
  }
});
