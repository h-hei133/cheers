import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  acquireBrowserReceiptCacheLock,
  browserReceiptCacheLockPath,
  readBrowserReceiptCacheLock,
} from "./browserReceiptCacheLock.js";

describe("browser receipt cache lock", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "browser-receipt-cache-lock-"));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("acquires and releases an explicit cache-root lock", () => {
    const lock = acquireBrowserReceiptCacheLock({
      cacheRoot: root,
      operation: "write",
      lockId: "lock-1",
      ownerId: "test-owner",
      now: () => "2026-05-17T00:00:00.000Z",
    });

    expect(lock.status).toBe("acquired");
    expect(readBrowserReceiptCacheLock(root, { now: () => "2026-05-17T00:00:01.000Z" }).status).toBe("active");
    expect(lock.status === "acquired" ? lock.release().status : "invalid").toBe("released");
    expect(readBrowserReceiptCacheLock(root).status).toBe("missing");
  });

  it("blocks busy locks and replaces stale locks deterministically", () => {
    const active = acquireBrowserReceiptCacheLock({
      cacheRoot: root,
      operation: "compact",
      lockId: "active",
      now: () => "2026-05-17T00:00:00.000Z",
      leaseMs: 60_000,
    });
    expect(active.status).toBe("acquired");

    const busy = acquireBrowserReceiptCacheLock({
      cacheRoot: root,
      operation: "write",
      lockId: "busy",
      now: () => "2026-05-17T00:00:01.000Z",
    });
    expect(busy.status).toBe("busy");

    fs.writeFileSync(
      browserReceiptCacheLockPath(root),
      `${JSON.stringify({
        version: "browser-receipt-cache-lock/v1",
        lockId: "stale",
        ownerId: "test-owner",
        operation: "write",
        createdAt: "2026-05-17T00:00:00.000Z",
        expiresAt: "2026-05-17T00:00:01.000Z",
      })}\n`,
      "utf8",
    );
    const replaced = acquireBrowserReceiptCacheLock({
      cacheRoot: root,
      operation: "repair",
      lockId: "replacement",
      now: () => "2026-05-17T00:00:02.000Z",
    });
    expect(replaced.status).toBe("acquired");
    expect(replaced.evidence).toContain("browser-receipt-cache-lock:acquired-after-stale");
  });
});
