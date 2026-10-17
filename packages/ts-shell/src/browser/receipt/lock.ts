import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { readReceiptFile } from "./io.js";
import { browserActionCacheEntryHasForbiddenContent } from "../actionCacheEntry.js";
import { redactReportText } from "../../core/security/redaction.js";
import path from "node:path";

export type BrowserReceiptCacheLockOperation =
  | "write"
  | "compact"
  | "repair"
  | "delete"
  | "invalidate";
export type BrowserReceiptCacheLockStatus =
  | "acquired"
  | "busy"
  | "expired"
  | "invalid"
  | "released";

export interface BrowserReceiptCacheLock {
  readonly version: "browser-receipt-cache-lock/v1";
  readonly lockId: string;
  readonly ownerId: string;
  readonly operation: BrowserReceiptCacheLockOperation;
  readonly createdAt: string;
  readonly expiresAt: string;
}

export type BrowserReceiptCacheLockDecision =
  | {
      readonly status: "acquired";
      readonly lock: BrowserReceiptCacheLock;
      readonly evidence: readonly string[];
      readonly warnings: readonly string[];
      ownsLock(): boolean;
      release(): BrowserReceiptCacheLockReleaseResult;
    }
  | {
      readonly status: Exclude<BrowserReceiptCacheLockStatus, "acquired" | "released">;
      readonly existing?: BrowserReceiptCacheLock;
      readonly reason: string;
      readonly evidence: readonly string[];
      readonly warnings: readonly string[];
    };

export interface BrowserReceiptCacheLockReleaseResult {
  readonly status: "released" | "invalid";
  readonly evidence: readonly string[];
  readonly warnings: readonly string[];
}

export interface BrowserReceiptCacheLockSnapshot {
  readonly status: "missing" | "active" | "stale" | "invalid";
  readonly operation?: BrowserReceiptCacheLockOperation;
  readonly ownerId?: string;
  readonly createdAt?: string;
  readonly expiresAt?: string;
  readonly evidence: readonly string[];
  readonly warnings: readonly string[];
}

export function browserReceiptCacheLockPath(cacheRoot: string): string {
  return path.join(cacheRoot, "browser-receipt-cache.lock.json");
}

export function acquireBrowserReceiptCacheLock(input: {
  readonly cacheRoot: string;
  readonly operation: BrowserReceiptCacheLockOperation;
  readonly ownerId?: string;
  readonly now?: () => string;
  readonly leaseMs?: number;
  readonly lockId?: string;
  readonly assertOwner?: () => void;
}): BrowserReceiptCacheLockDecision {
  const now = input.now ?? (() => new Date().toISOString());
  const leaseMs = input.leaseMs ?? 30_000;
  const createdAt = now();
  if (!Number.isFinite(Date.parse(createdAt)) || !Number.isSafeInteger(leaseMs) || leaseMs <= 0 || leaseMs > 86_400_000) {
    return invalidDecision("Browser receipt cache lock options are invalid.");
  }
  const lock: BrowserReceiptCacheLock = {
    version: "browser-receipt-cache-lock/v1",
    lockId: input.lockId ?? randomUUID(),
    ownerId: input.ownerId ?? "browser-receipt-cache-store",
    operation: input.operation,
    createdAt,
    expiresAt: new Date(Date.parse(createdAt) + leaseMs).toISOString(),
  };
  if (!parseBrowserReceiptCacheLock(lock)) return invalidDecision("Browser receipt cache lock options are invalid.");
  const lockPath = browserReceiptCacheLockPath(input.cacheRoot);
  try {
    input.assertOwner?.();
    fs.mkdirSync(input.cacheRoot, { recursive: true });
    input.assertOwner?.();
    const fd = fs.openSync(lockPath, "wx", 0o600);
    try {
      fs.writeFileSync(fd, `${JSON.stringify(lock)}\n`, "utf8");
      return acquired(input.cacheRoot, lock, fs.fstatSync(fd), input.assertOwner);
    } finally {
      fs.closeSync(fd);
    }
  } catch (error) {
    if (!isFileExistsError(error)) {
      return {
        status: "invalid",
        reason: "Browser receipt cache lock could not be created.",
        evidence: ["browser-receipt-cache-lock:invalid"],
        warnings: ["browser-receipt-cache-lock:create-failed"],
      };
    }
  }

  const existing = readBrowserReceiptCacheLock(input.cacheRoot, { now });
  if (existing.status === "invalid") {
    return {
      status: "invalid",
      reason: "Browser receipt cache lock file is invalid.",
      evidence: existing.evidence,
      warnings: existing.warnings,
    };
  }
  if (existing.status === "stale") {
    return {
      status: "expired",
      existing: existingToLock(existing),
      reason: "Browser receipt cache lock expired. Stop all writers before removing the abandoned lock.",
      evidence: ["browser-receipt-cache-lock:expired"],
      warnings: ["browser-receipt-cache-lock:manual-recovery-required"],
    };
  }

  return {
    status: "busy",
    existing: existingToLock(existing),
    reason: "Browser receipt cache is busy with another explicit operation.",
    evidence: ["browser-receipt-cache-lock:busy"],
    warnings: ["browser-receipt-cache-lock:busy"],
  };
}

export function readBrowserReceiptCacheLock(
  cacheRoot: string,
  input: { readonly now?: () => string } = {},
): BrowserReceiptCacheLockSnapshot {
  const lockPath = browserReceiptCacheLockPath(cacheRoot);
  const file = readReceiptFile(lockPath, 4096);
  if (file.status === "missing") {
    return {
      status: "missing",
      evidence: ["browser-receipt-cache-lock:missing"],
      warnings: [],
    };
  }
  if (file.status !== "read") return invalidSnapshot();
  try {
    const parsed = parseBrowserReceiptCacheLock(JSON.parse(file.content));
    if (!parsed) {
      return invalidSnapshot();
    }
    const now = Date.parse(input.now?.() ?? new Date().toISOString());
    if (!Number.isFinite(now)) return invalidSnapshot();
    const expiresAt = Date.parse(parsed.expiresAt);
    return {
      status: Number.isFinite(expiresAt) && expiresAt <= now ? "stale" : "active",
      operation: parsed.operation,
      ownerId: parsed.ownerId,
      createdAt: parsed.createdAt,
      expiresAt: parsed.expiresAt,
      evidence: ["browser-receipt-cache-lock:read"],
      warnings: Number.isFinite(expiresAt) && expiresAt <= now
        ? ["browser-receipt-cache-lock:stale"]
        : [],
    };
  } catch {
    return invalidSnapshot();
  }
}

/** Cooperative exclusion in a stable local directory; expiration never transfers ownership. */
function acquired(cacheRoot: string, lock: BrowserReceiptCacheLock, identity: fs.Stats, assertOwner?: () => void): Extract<BrowserReceiptCacheLockDecision, { status: "acquired" }> {
  const lockPath = browserReceiptCacheLockPath(cacheRoot);
  let released: BrowserReceiptCacheLockReleaseResult | undefined;
  function ownsLock(): boolean {
    if (released) return false;
    try {
      assertOwner?.();
      const currentIdentity = fs.lstatSync(lockPath);
      const file = readReceiptFile(lockPath, 4096);
      if (!currentIdentity.isFile() || currentIdentity.dev !== identity.dev || currentIdentity.ino !== identity.ino || file.status !== "read") return false;
      const current = parseBrowserReceiptCacheLock(JSON.parse(file.content));
      return current !== undefined && JSON.stringify(current) === JSON.stringify(lock);
    } catch { return false; }
  }
  return {
    status: "acquired", lock,
    evidence: ["browser-receipt-cache-lock:acquired"], warnings: [],
    ownsLock,
    release() {
      if (released) return released;
      try {
        if (!ownsLock()) throw new Error("Lock ownership unavailable.");
        fs.unlinkSync(lockPath);
        released = { status: "released", evidence: ["browser-receipt-cache-lock:released"], warnings: [] };
      } catch {
        released = { status: "invalid", evidence: ["browser-receipt-cache-lock:release-unverified"], warnings: ["browser-receipt-cache-lock:release-unverified"] };
      }
      return released;
    },
  };
}

function parseBrowserReceiptCacheLock(value: unknown): BrowserReceiptCacheLock | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const lock = value as Partial<BrowserReceiptCacheLock>;
  if (lock.version !== "browser-receipt-cache-lock/v1") {
    return undefined;
  }
  if (![lock.lockId, lock.ownerId, lock.createdAt, lock.expiresAt].every((value) => typeof value === "string" && value.length > 0 && value.length <= 200)) {
    return undefined;
  }
  if (!["write", "compact", "repair", "delete", "invalidate"].includes(lock.operation ?? "")) {
    return undefined;
  }
  const redactions = new Set<string>();
  redactReportText(JSON.stringify(lock), 4096, { redactions });
  if (redactions.size > 0) return undefined;
  if (browserActionCacheEntryHasForbiddenContent(JSON.stringify(lock)) ||
      !Number.isFinite(Date.parse(lock.createdAt!)) || !Number.isFinite(Date.parse(lock.expiresAt!)) ||
      Date.parse(lock.expiresAt!) <= Date.parse(lock.createdAt!)) return undefined;
  return {
    version: "browser-receipt-cache-lock/v1", lockId: lock.lockId!, ownerId: lock.ownerId!,
    operation: lock.operation!, createdAt: lock.createdAt!, expiresAt: lock.expiresAt!,
  };
}

function existingToLock(snapshot: BrowserReceiptCacheLockSnapshot): BrowserReceiptCacheLock | undefined {
  if (!snapshot.operation || !snapshot.ownerId || !snapshot.createdAt || !snapshot.expiresAt) {
    return undefined;
  }
  return {
    version: "browser-receipt-cache-lock/v1",
    lockId: "redacted-existing-lock",
    operation: snapshot.operation,
    ownerId: snapshot.ownerId,
    createdAt: snapshot.createdAt,
    expiresAt: snapshot.expiresAt,
  };
}

function invalidSnapshot(): BrowserReceiptCacheLockSnapshot {
  return {
    status: "invalid",
    evidence: ["browser-receipt-cache-lock:invalid"],
    warnings: ["browser-receipt-cache-lock:invalid"],
  };
}

function isFileExistsError(error: unknown): boolean {
  return !!error && typeof error === "object" && (error as { code?: string }).code === "EEXIST";
}

function invalidDecision(reason: string): Extract<BrowserReceiptCacheLockDecision, { status: "invalid" | "busy" | "expired" }> {
  return { status: "invalid", reason, evidence: ["browser-receipt-cache-lock:invalid"], warnings: ["browser-receipt-cache-lock:invalid-options"] };
}
