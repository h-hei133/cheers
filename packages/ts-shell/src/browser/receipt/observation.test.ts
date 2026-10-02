import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { safeReceipt } from "../actionCacheEntry.test.js";
import { runBrowserReplayCommand } from "../replayCommandRunner.js";
import { createBrowserActionCache } from "../actionCache.js";
import { FakeBrowserExecutor } from "../executor.js";
import { createBrowserSandboxAuthority } from "../sandboxAuthority.js";
import { createBrowserNetworkAllowlist } from "../networkAllowlist.js";
import { createBrowserReceiptCacheManifest, validateBrowserReceiptCacheManifest } from "./manifest.js";
import { createBrowserReceiptCacheStore } from "./store.js";

describe("receipt cache observation boundaries", () => {
  let root: string;
  beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), "receipt-observation-")); });
  afterEach(() => { vi.restoreAllMocks(); fs.rmSync(root, { recursive: true, force: true }); });

  it("denies reads before touching storage and preserves a blocked result", () => {
    const writer = createBrowserReceiptCacheStore({ manifest: createBrowserReceiptCacheManifest({ cacheRoot: root }) });
    const receipt = safeReceipt();
    expect(writer.writeReceipt(receipt).written).toBe(true);
    const store = createBrowserReceiptCacheStore({
      manifest: createBrowserReceiptCacheManifest({ cacheRoot: root, allowedOperations: ["write"] }),
    });
    const reads = vi.spyOn(fs, "readFileSync");
    const opens = vi.spyOn(fs, "openSync");
    expect(store.get(receipt.receiptId)).toMatchObject({ status: "blocked" });
    expect(store.list()).toMatchObject({ status: "blocked", records: [] });
    expect(store.health()).toMatchObject({ readable: false, recordCount: 0 });
    expect(reads).not.toHaveBeenCalled();
    expect(opens).not.toHaveBeenCalled();
  });

  it("does not create directories during status", async () => {
    const cacheRoot = path.join(root, "missing", "cache");
    const store = createBrowserReceiptCacheStore({ manifest: createBrowserReceiptCacheManifest({ cacheRoot }) });
    await runBrowserReplayCommand({ request: { mode: "cache-status", sourceCommand: "/browser replay" }, receiptCacheStore: store });
    expect(fs.existsSync(path.join(root, "missing"))).toBe(false);
  });

  it("uses one health observation for status output and evidence", async () => {
    const store = createBrowserReceiptCacheStore({ manifest: createBrowserReceiptCacheManifest({ cacheRoot: root }) });
    const health = vi.spyOn(store, "health");
    await runBrowserReplayCommand({ request: { mode: "cache-status", sourceCommand: "/browser replay" }, receiptCacheStore: store });
    expect(health).toHaveBeenCalledTimes(1);
  });

  it.each(["cache-compact", "cache-repair"] as const)("blocks %s when no store ran", async (mode) => {
    const result = await runBrowserReplayCommand({ request: { mode, sourceCommand: "/browser replay" } });
    expect(result.output).toContain("Outcome: blocked");
    expect(result.output).not.toContain("Blockers/warnings: none");
  });

  it("rejects malformed manifests at the factory and snapshots valid permissions", () => {
    const manifest = createBrowserReceiptCacheManifest({ cacheRoot: root, allowedOperations: ["read"] });
    expect(validateBrowserReceiptCacheManifest({ ...manifest, warnings: "invalid" }).ok).toBe(false);
    expect(() => createBrowserReceiptCacheStore({ manifest: { ...manifest, maxRecords: 0 } })).toThrow();
    const store = createBrowserReceiptCacheStore({ manifest });
    (manifest.allowedOperations as string[]).push("write");
    expect(store.writeReceipt(safeReceipt()).written).toBe(false);
  });

  it("returns unavailable rather than empty for a non-file cache", () => {
    fs.mkdirSync(path.join(root, "browser-receipt-cache.jsonl"));
    const store = createBrowserReceiptCacheStore({ manifest: createBrowserReceiptCacheManifest({ cacheRoot: root }) });
    expect(store.list()).toMatchObject({ status: "blocked", records: [] });
    expect(store.health()).toMatchObject({ readable: false, integrity: { integrityStatus: "unavailable" } });
  });

  it.each(["tombstone", "corrupted", "unknown-version", "denied"])("blocks memory replay when persistent state is %s", async (state) => {
    const receipt = safeReceipt();
    const cache = createBrowserActionCache();
    cache.addReceipt(receipt);
    const store = createBrowserReceiptCacheStore({
      manifest: createBrowserReceiptCacheManifest({ cacheRoot: root, maxRecords: 1, allowedOperations: ["read", "write", "delete"] }),
    });
    expect(store.writeReceipt(receipt).written).toBe(true);
    if (state === "tombstone") {
      expect(store.delete(receipt.receiptId, "test").changed).toBe(true);
      expect(store.delete("second-tombstone", "test").changed).toBe(true);
      expect(store.list().records).toHaveLength(2);
    } else if (state !== "denied") {
      fs.appendFileSync(path.join(root, "browser-receipt-cache.jsonl"), state === "corrupted" ? "broken\n" : '{"version":"future"}\n');
    }
    const selected = state === "denied" ? createBrowserReceiptCacheStore({
      manifest: createBrowserReceiptCacheManifest({ cacheRoot: root, allowedOperations: ["write"] }),
    }) : store;
    const executor = new FakeBrowserExecutor();
    const execute = vi.spyOn(executor, "execute");
    const result = await runBrowserReplayCommand({
      request: { mode: "replay", receiptId: receipt.receiptId, sourceCommand: "/browser replay" },
      actionCache: cache, receiptCacheStore: selected, executor,
      sandboxAuthority: createBrowserSandboxAuthority({ mode: "fake-test" }),
      networkAllowlist: createBrowserNetworkAllowlist(),
      confirmations: [{ kind: "sandbox", status: "confirmed" }],
    });
    expect(result.output).toContain("Outcome: blocked");
    expect(execute).not.toHaveBeenCalled();
  });

  it.each(["delete", "invalidate"] as const)("checks the receipt behind a memory entry alias after %s", async (operation) => {
    const receipt = safeReceipt();
    const cache = createBrowserActionCache();
    const added = cache.addReceipt(receipt);
    if (!added.ok) throw new Error("cache fixture rejected");
    const store = createBrowserReceiptCacheStore({ manifest: createBrowserReceiptCacheManifest({ cacheRoot: root, allowedOperations: ["read", "write", operation] }) });
    expect(store.writeReceipt(receipt).written).toBe(true);
    expect(store[operation](receipt.receiptId, "test").changed).toBe(true);
    const executor = new FakeBrowserExecutor();
    const execute = vi.spyOn(executor, "execute");
    const result = await runBrowserReplayCommand({
      request: { mode: "replay", receiptId: added.entry.entryId, sourceCommand: "/browser replay" },
      actionCache: cache, receiptCacheStore: store, executor,
      sandboxAuthority: createBrowserSandboxAuthority({ mode: "fake-test" }),
      networkAllowlist: createBrowserNetworkAllowlist(), confirmations: [{ kind: "sandbox", status: "confirmed" }],
    });
    expect(result.output).toContain("Outcome: blocked");
    expect(execute).not.toHaveBeenCalled();
  });
});
