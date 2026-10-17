import { isRecord } from "../../core/values/record.js";
import path from "node:path";
import { browserActionCacheEntryHasForbiddenContent } from "../actionCacheEntry.js";
import { freezeDeep } from "../../core/values/freeze.js";
import { redactReportText } from "../../core/security/redaction.js";
import { readReceiptFile } from "./io.js";
import { assertProfileStorage, currentProfile, profilePathOverride } from '../../core/paths/profile/context.js';

export const BROWSER_RECEIPT_CACHE_MANIFEST_ENV =
  "CHEERS_BROWSER_RECEIPT_CACHE_MANIFEST";
export const BROWSER_RECEIPT_CACHE_ROOT_ENV =
  "CHEERS_BROWSER_RECEIPT_CACHE_ROOT";

export type BrowserReceiptCacheManifestVersion = "browser-receipt-cache-manifest/v1";
export type BrowserReceiptCacheSource = "cli-harness" | "explicit-local" | "test-only";
export type BrowserReceiptCacheScope = "project" | "session" | "harness";
export type BrowserReceiptCacheOperation = "read" | "write" | "invalidate" | "delete";

export interface BrowserReceiptCacheManifest {
  readonly version: BrowserReceiptCacheManifestVersion;
  readonly cacheRoot: string;
  readonly source: BrowserReceiptCacheSource;
  readonly allowedOperations: readonly BrowserReceiptCacheOperation[];
  readonly scope: BrowserReceiptCacheScope;
  readonly maxRecords: number;
  readonly redactionPolicy: "safe-summary-only";
  readonly cleanupPolicy: "manual" | "delete-tombstone";
  readonly warnings: readonly string[];
}

export type BrowserReceiptCacheManifestValidation =
  | {
      readonly ok: true;
      readonly manifest: BrowserReceiptCacheManifest;
      readonly evidence: readonly string[];
      readonly warnings: readonly string[];
    }
  | {
      readonly ok: false;
      readonly reason: string;
      readonly evidence: readonly string[];
      readonly warnings: readonly string[];
      readonly redactions: readonly string[];
    };

export function createBrowserReceiptCacheManifest(input: {
  readonly cacheRoot: string;
  readonly source?: BrowserReceiptCacheSource;
  readonly allowedOperations?: readonly BrowserReceiptCacheOperation[];
  readonly scope?: BrowserReceiptCacheScope;
  readonly maxRecords?: number;
  readonly cleanupPolicy?: "manual" | "delete-tombstone";
  readonly warnings?: readonly string[];
}): BrowserReceiptCacheManifest {
  return {
    version: "browser-receipt-cache-manifest/v1",
    cacheRoot: input.cacheRoot,
    source: input.source ?? "test-only",
    allowedOperations: input.allowedOperations ?? ["read", "write"],
    scope: input.scope ?? "harness",
    maxRecords: input.maxRecords ?? 20,
    redactionPolicy: "safe-summary-only",
    cleanupPolicy: input.cleanupPolicy ?? "delete-tombstone",
    warnings: input.warnings ?? [],
  };
}

export function validateBrowserReceiptCacheManifest(
  value: unknown,
): BrowserReceiptCacheManifestValidation {
  if (!isRecord(value)) {
    return invalid("Cache manifest must be an object.");
  }
  const manifest = value as Partial<BrowserReceiptCacheManifest>;
  if (manifest.version !== "browser-receipt-cache-manifest/v1") {
    return invalid("Cache manifest version is unsupported.");
  }
  if (!manifest.cacheRoot || typeof manifest.cacheRoot !== "string") {
    return invalid("Cache manifest requires an explicit cache root.");
  }
  const normalizedRoot = path.resolve(manifest.cacheRoot);
  if (!isSafeExplicitRoot(normalizedRoot)) {
    return invalid("Cache root must be an explicit non-global local path.");
  }
  try { assertProfileStorage(normalizedRoot); }
  catch { return invalid('Cache root must stay inside the selected profile.'); }
  let serialized: string;
  try { serialized = JSON.stringify(value); } catch { return invalid("Cache manifest is not serializable."); }
  const redactions = new Set<string>();
  redactReportText(serialized, 16_384, { redactions });
  if (Buffer.byteLength(serialized) > 16_384 || redactions.size > 0 || browserActionCacheEntryHasForbiddenContent(serialized)) {
    return invalid("Cache manifest contains unsafe content.", ["browser-receipt-cache-manifest:redacted"]);
  }
  if (!["cli-harness", "explicit-local", "test-only"].includes(manifest.source ?? "")) {
    return invalid("Cache manifest source is unsupported.");
  }
  if (!["project", "session", "harness"].includes(manifest.scope ?? "")) {
    return invalid("Cache manifest scope is unsupported.");
  }
  if (!Number.isInteger(manifest.maxRecords) || (manifest.maxRecords ?? 0) <= 0 || (manifest.maxRecords ?? 0) > 1000) {
    return invalid("Cache manifest requires a maxRecords budget between 1 and 1000.");
  }
  const operations = manifest.allowedOperations;
  if (!Array.isArray(operations) || operations.length === 0) {
    return invalid("Cache manifest requires allowed operations.");
  }
  if (!operations.every((operation) => ["read", "write", "invalidate", "delete"].includes(operation))) {
    return invalid("Cache manifest contains unsupported operations.");
  }
  if (manifest.redactionPolicy !== "safe-summary-only") {
    return invalid("Cache manifest must use safe-summary-only redaction.");
  }
  if (!["manual", "delete-tombstone"].includes(manifest.cleanupPolicy ?? "")) {
    return invalid("Cache manifest cleanup policy is unsupported.");
  }
  if (!Array.isArray(manifest.warnings) || !manifest.warnings.every((warning) => typeof warning === "string")) {
    return invalid("Cache manifest warnings must be strings.");
  }
  return {
    ok: true,
    manifest: freezeDeep({
      version: "browser-receipt-cache-manifest/v1",
      cacheRoot: normalizedRoot,
      source: manifest.source,
      allowedOperations: [...new Set(operations)],
      scope: manifest.scope,
      maxRecords: manifest.maxRecords,
      redactionPolicy: "safe-summary-only",
      cleanupPolicy: manifest.cleanupPolicy,
      warnings: [...manifest.warnings],
    } as BrowserReceiptCacheManifest),
    evidence: [
      "browser-receipt-cache-manifest:valid",
      "browser-receipt-cache-manifest:explicit-root",
      "browser-receipt-cache-manifest:no-default-cache",
    ],
    warnings: manifest.warnings ?? [],
  };
}

export function loadBrowserReceiptCacheManifestFromEnv(input: {
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly readFile?: (path: string) => string;
} = {}): BrowserReceiptCacheManifestValidation {
  const env = input.env ?? process.env;
  const manifestPath = currentProfile() ? profilePathOverride(BROWSER_RECEIPT_CACHE_MANIFEST_ENV) : env[BROWSER_RECEIPT_CACHE_MANIFEST_ENV];
  const root = currentProfile() ? profilePathOverride(BROWSER_RECEIPT_CACHE_ROOT_ENV) : env[BROWSER_RECEIPT_CACHE_ROOT_ENV];
  if (manifestPath) {
    try {
      const file = input.readFile ? { status: "read", content: input.readFile(manifestPath) } : readReceiptFile(manifestPath, 16_384);
      if (file.status !== "read" || !("content" in file) || Buffer.byteLength(file.content) > 16_384) return invalid("Browser receipt cache manifest is unavailable or oversized.");
      return validateBrowserReceiptCacheManifest(JSON.parse(file.content));
    } catch {
      return invalid("Browser receipt cache manifest could not be read or parsed.", ["browser-receipt-cache-manifest"]);
    }
  }
  if (root) {
    return validateBrowserReceiptCacheManifest(createBrowserReceiptCacheManifest({
      cacheRoot: root,
      source: "cli-harness",
      allowedOperations: ["read", "write", "invalidate", "delete"],
      scope: "harness",
    }));
  }
  return invalid("No explicit browser receipt cache manifest or root was provided.");
}

function invalid(
  reason: string,
  redactions: readonly string[] = [],
): Extract<BrowserReceiptCacheManifestValidation, { ok: false }> {
  return {
    ok: false,
    reason,
    evidence: [
      "browser-receipt-cache-manifest:invalid",
      "browser-receipt-cache-manifest:safe-error",
      "browser-receipt-cache-manifest:no-default-cache",
    ],
    warnings: ["browser-receipt-cache-manifest:blocked"],
    redactions,
  };
}

function isSafeExplicitRoot(root: string): boolean {
  const parsed = path.parse(root);
  if (root === parsed.root) {
    return false;
  }
  const normalized = root.replace(/\\/g, "/");
  if (/\/(\.\.)(\/|$)/.test(normalized)) {
    return false;
  }
  return !["/tmp", "/var/tmp", "/home", "/"].includes(normalized);
}
