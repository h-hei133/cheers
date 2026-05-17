import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  createBrowserReceiptCacheManifest,
  loadBrowserReceiptCacheManifestFromEnv,
  validateBrowserReceiptCacheManifest,
  BROWSER_RECEIPT_CACHE_ROOT_ENV,
} from "./browserReceiptCacheManifest.js";

describe("browser receipt cache manifest", () => {
  it("validates explicit local cache roots with budgets", () => {
    const manifest = createBrowserReceiptCacheManifest({
      cacheRoot: path.join(process.cwd(), ".tmp-route108-cache"),
      allowedOperations: ["read", "write", "invalidate", "delete"],
      maxRecords: 5,
    });

    const result = validateBrowserReceiptCacheManifest(manifest);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.manifest.maxRecords).toBe(5);
    expect(result.evidence).toContain("browser-receipt-cache-manifest:no-default-cache");
  });

  it("rejects global/default paths and unsafe content", () => {
    expect(validateBrowserReceiptCacheManifest(createBrowserReceiptCacheManifest({
      cacheRoot: "/tmp",
    })).ok).toBe(false);

    expect(validateBrowserReceiptCacheManifest({
      ...createBrowserReceiptCacheManifest({
        cacheRoot: path.join(process.cwd(), ".tmp-route108-cache"),
      }),
      warnings: ["sk-1234567890abcdef"],
    }).ok).toBe(false);
  });

  it("loads an explicit root from env without enabling a default cache", () => {
    const result = loadBrowserReceiptCacheManifestFromEnv({
      env: {
        [BROWSER_RECEIPT_CACHE_ROOT_ENV]: path.join(process.cwd(), ".tmp-route108-cache"),
      },
    });

    expect(result.ok).toBe(true);
  });
});
