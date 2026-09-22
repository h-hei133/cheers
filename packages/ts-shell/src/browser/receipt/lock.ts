import fs from "node:fs";
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
}): BrowserReceiptCacheLockDecision {
  const now = input.now ?? (() => new Date().toISOString());
  const leaseMs = input.leaseMs ?? 30_000;
  const createdAt = now();
  const lock: BrowserReceiptCacheLock = {
    version: "browser-receipt-cache-lock/v1",
    lockId: input.lockId ?? `browser-receipt-cache-lock-${Date.now()}-${process.pid}`,
    ownerId: input.ownerId ?? "browser-receipt-cache-store",
    operation: input.operation,
    createdAt,
    expiresAt: new Date(Date.parse(createdAt) + leaseMs).toISOString(),
  };
  const lockPath = browserReceiptCacheLockPath(input.cacheRoot);
  try {
    fs.mkdirSync(input.cacheRoot, { recursive: true });
    fs.writeFileSync(lockPath, `${JSON.stringify(lock)}\n`, { encoding: "utf8", flag: "wx" });
    return acquired(input.cacheRoot, lock);
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
    try {
      fs.writeFileSync(lockPath, `${JSON.stringify(lock)}\n`, "utf8");
      return {
        ...acquired(input.cacheRoot, lock),
        evidence: [
          "browser-receipt-cache-lock:expired",
          "browser-receipt-cache-lock:acquired-after-stale",
        ],
        warnings: ["browser-receipt-cache-lock:stale-replaced"],
      };
    } catch {
      return {
        status: "invalid",
        existing: existingToLock(existing),
        reason: "Browser receipt cache stale lock could not be replaced.",
        evidence: ["browser-receipt-cache-lock:stale-replace-failed"],
        warnings: ["browser-receipt-cache-lock:write-failed"],
      };
    }
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
  if (!fs.existsSync(lockPath)) {
    return {
      status: "missing",
      evidence: ["browser-receipt-cache-lock:missing"],
      warnings: [],
    };
  }
  try {
    const parsed = parseBrowserReceiptCacheLock(JSON.parse(fs.readFileSync(lockPath, "utf8")));
    if (!parsed) {
      return invalidSnapshot();
    }
    const now = Date.parse(input.now?.() ?? new Date().toISOString());
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

function acquired(cacheRoot: string, lock: BrowserReceiptCacheLock): Extract<BrowserReceiptCacheLockDecision, { status: "acquired" }> {
  return {
    status: "acquired",
    lock,
    evidence: ["browser-receipt-cache-lock:acquired"],
    warnings: [],
    release() {
      const lockPath = browserReceiptCacheLockPath(cacheRoot);
      try {
        const current = parseBrowserReceiptCacheLock(JSON.parse(fs.readFileSync(lockPath, "utf8")));
        if (!current || current.lockId !== lock.lockId) {
          return {
            status: "invalid",
            evidence: ["browser-receipt-cache-lock:release-mismatch"],
            warnings: ["browser-receipt-cache-lock:not-owner"],
          };
        }
        fs.unlinkSync(lockPath);
        return {
          status: "released",
          evidence: ["browser-receipt-cache-lock:released"],
          warnings: [],
        };
      } catch {
        return {
          status: "invalid",
          evidence: ["browser-receipt-cache-lock:release-failed"],
          warnings: ["browser-receipt-cache-lock:release-failed"],
        };
      }
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
  if (!lock.lockId || !lock.ownerId || !lock.createdAt || !lock.expiresAt) {
    return undefined;
  }
  if (!["write", "compact", "repair", "delete", "invalidate"].includes(lock.operation ?? "")) {
    return undefined;
  }
  return lock as BrowserReceiptCacheLock;
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
