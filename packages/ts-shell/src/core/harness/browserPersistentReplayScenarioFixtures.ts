import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createBrowserReceiptCacheManifest,
  BROWSER_RECEIPT_CACHE_ROOT_ENV,
} from "../../browser/receipt/manifest.js";
import { createBrowserReceiptCacheStore } from "../../browser/receipt/store.js";
import {
  createBrowserReplayScenarioFixture,
  type BrowserReplayScenarioFixture,
  type BrowserReplayScenarioFixtureKind,
} from "./browserReplayScenarioFixtures.js";

export interface BrowserPersistentReplayScenarioFixture extends BrowserReplayScenarioFixture {
  readonly cacheRoot: string;
  readonly receiptCacheStore: ReturnType<typeof createBrowserReceiptCacheStore>;
  readonly persistentEnv: Readonly<Record<string, string>>;
  freshReceiptCacheStore(): ReturnType<typeof createBrowserReceiptCacheStore>;
  readCacheFile(): string;
}

export function createBrowserPersistentReplayScenarioFixture(input: {
  readonly kind?: BrowserReplayScenarioFixtureKind;
} = {}): BrowserPersistentReplayScenarioFixture {
  const base = createBrowserReplayScenarioFixture(input);
  const cacheRoot = fs.mkdtempSync(path.join(os.tmpdir(), "browser-persistent-replay-"));
  const manifest = createBrowserReceiptCacheManifest({
    cacheRoot,
    source: "cli-harness",
    allowedOperations: ["read", "write", "invalidate", "delete"],
    scope: "harness",
  });
  const receiptCacheStore = createBrowserReceiptCacheStore({ manifest });
  return {
    ...base,
    cacheRoot,
    receiptCacheStore,
    persistentEnv: {
      ...base.env,
      [BROWSER_RECEIPT_CACHE_ROOT_ENV]: cacheRoot,
    },
    freshReceiptCacheStore() {
      return createBrowserReceiptCacheStore({ manifest });
    },
    readCacheFile() {
      const filePath = path.join(cacheRoot, "browser-receipt-cache.jsonl");
      return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
    },
    cleanup() {
      base.cleanup();
      fs.rmSync(cacheRoot, { recursive: true, force: true });
    },
  };
}
