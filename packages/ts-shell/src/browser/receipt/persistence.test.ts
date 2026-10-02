import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { safeReceipt } from "../actionCacheEntry.test.js";
import { runBrowserReplayCommand } from "../replayCommandRunner.js";
import { createBrowserReceiptCacheManifest } from "./manifest.js";
import { createBrowserReceiptCacheStore } from "./store.js";
import { MAX_RECEIPT_CACHE_BYTES } from "./recovery.js";

describe("receipt file fault boundaries", () => {
  let root: string;
  beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), "receipt-persistence-")); });
  afterEach(() => { vi.restoreAllMocks(); fs.rmSync(root, { recursive: true, force: true }); });
  function store() { return createBrowserReceiptCacheStore({ manifest: createBrowserReceiptCacheManifest({ cacheRoot: root, allowedOperations: ["read", "write", "delete"] }) }); }

  it("blocks oversized files without exposing earlier records", () => {
    const cache = store();
    const receipt = safeReceipt();
    expect(cache.writeReceipt(receipt).written).toBe(true);
    fs.truncateSync(path.join(root, "browser-receipt-cache.jsonl"), MAX_RECEIPT_CACHE_BYTES + 1);
    expect(cache.get(receipt.receiptId).status).toBe("blocked");
    expect(cache.repair().outcome).toBe("blocked");
  });

  it("does not follow cache-file symlinks", () => {
    const target = path.join(root, "other");
    fs.writeFileSync(target, "untouched");
    fs.symlinkSync(target, path.join(root, "browser-receipt-cache.jsonl"));
    expect(store().writeReceipt(safeReceipt()).written).toBe(false);
    expect(fs.readFileSync(target, "utf8")).toBe("untouched");
  });

  it("preserves old bytes and cleans its own temporary file after a failed rename", () => {
    const cache = store();
    const receipt = safeReceipt();
    expect(cache.writeReceipt(receipt).written).toBe(true);
    const file = path.join(root, "browser-receipt-cache.jsonl");
    const bytes = fs.readFileSync(file);
    vi.spyOn(fs, "renameSync").mockImplementation(() => { throw new Error("injected rename failure"); });
    expect(cache.delete(receipt.receiptId, "test")).toMatchObject({ changed: false, outcome: "unverified", cleanup: "released" });
    expect(fs.readFileSync(file)).toEqual(bytes);
    expect(fs.readdirSync(root)).toEqual(["browser-receipt-cache.jsonl"]);
  });

  it("reports unverified when replacement happened but readback disagrees", () => {
    const rename = fs.renameSync;
    vi.spyOn(fs, "renameSync").mockImplementation((from, to) => { rename(from, to); fs.writeFileSync(to, "unexpected"); });
    expect(store().writeReceipt(safeReceipt())).toMatchObject({ written: false, outcome: "unverified" });
  });

  it("keeps verified writes distinct from failed lock cleanup in command output", async () => {
    const cache = store();
    const receipt = safeReceipt();
    expect(cache.writeReceipt(receipt).written).toBe(true);
    const unlink = fs.unlinkSync;
    vi.spyOn(fs, "unlinkSync").mockImplementation((target) => {
      if (String(target).endsWith(".lock.json")) throw new Error("injected cleanup failure");
      unlink(target);
    });
    const result = await runBrowserReplayCommand({ request: { mode: "cache-delete", receiptId: receipt.receiptId, sourceCommand: "/browser replay" }, receiptCacheStore: cache });
    expect(result.output).toContain("Outcome: delete");
    expect(result.output).toContain("Lock cleanup: unverified");
    expect(result.output).toContain("release-unverified");
    expect(cache.get(receipt.receiptId).status).toBe("missing");
  });

  it("does not read or create files for inadmissible maintenance", () => {
    const manifest = createBrowserReceiptCacheManifest({ cacheRoot: path.join(root, "missing"), allowedOperations: ["write"] });
    const cache = createBrowserReceiptCacheStore({ manifest });
    const open = vi.spyOn(fs, "openSync");
    expect(cache.compact().outcome).toBe("blocked");
    expect(cache.repair().outcome).toBe("blocked");
    expect(cache.writeReceipt(safeReceipt()).outcome).toBe("blocked");
    expect(open).not.toHaveBeenCalled();
    expect(fs.existsSync(manifest.cacheRoot)).toBe(false);
  });
});
