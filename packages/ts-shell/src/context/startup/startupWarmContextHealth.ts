import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  isStartupWarmContextCache,
  projectRootHash,
  sanitizeStartupWarmContextCache,
  startupWarmCacheHasForbiddenContent,
  type StartupWarmContextCache,
  type StartupWarmContextCacheMode,
  type StartupWarmContextStaleness,
} from "./startupWarmContextCache.js";

const MAX_CACHE_BYTES = 256 * 1024;

export interface StartupWarmContextCacheStoreRef {
  readonly mode: StartupWarmContextCacheMode;
  readonly projectRoot?: string;
  readonly cacheRoot?: string;
  readonly cacheFile?: string;
}

export interface StartupWarmContextCacheReadResult {
  readonly cache?: StartupWarmContextCache;
  readonly found: boolean;
  readonly staleness: StartupWarmContextStaleness;
  readonly blocker?: string;
  readonly evidence: readonly string[];
}

export interface StartupWarmContextCacheWriteResult {
  readonly written: boolean;
  readonly cache?: StartupWarmContextCache;
  readonly cacheFile?: string;
  readonly blocker?: string;
  readonly evidence: readonly string[];
}

export interface StartupWarmContextCacheHealth {
  readonly mode: StartupWarmContextCacheMode;
  readonly ok: boolean;
  readonly writable: boolean;
  readonly found: boolean;
  readonly staleness: StartupWarmContextStaleness;
  readonly cacheRoot?: string;
  readonly cacheFile?: string;
  readonly detail: string;
  readonly evidence: readonly string[];
}

export interface StartupWarmContextCacheHealthOptions {
  readonly currentSourceSignature?: string;
  readonly nowMs?: number;
  readonly ttlMs?: number;
}

export interface StartupWarmContextCacheStore {
  readonly ref: StartupWarmContextCacheStoreRef;
  read(options?: StartupWarmContextCacheHealthOptions): Promise<StartupWarmContextCacheReadResult>;
  write(cache: StartupWarmContextCache): Promise<StartupWarmContextCacheWriteResult>;
  health(options?: StartupWarmContextCacheHealthOptions): Promise<StartupWarmContextCacheHealth>;
}

export function createStartupWarmContextCacheStore(input: {
  readonly ref: StartupWarmContextCacheStoreRef;
}): StartupWarmContextCacheStore {
  const ref = normalizeRef(input.ref);
  return {
    ref,
    async read(options) {
      return readStartupWarmContextCache(ref, options);
    },
    async write(cache) {
      return writeStartupWarmContextCache(ref, cache);
    },
    async health(options) {
      return checkStartupWarmContextCacheHealth(ref, options);
    },
  };
}

export function readStartupWarmContextCache(
  ref: StartupWarmContextCacheStoreRef,
  options: StartupWarmContextCacheHealthOptions = {},
): StartupWarmContextCacheReadResult {
  ref = normalizeRef(ref);
  if (ref.mode === "disabled" || !storeRefIsUsable(ref)) {
    return {
      found: false,
      staleness: "unknown",
      ...(ref.mode === "disabled" ? {} : { blocker: "Explicit project root and cache root are required." }),
      evidence: [
        "startup-warm-context-store:explicit-roots-required",
        "startup-warm-context-store:no-default-path",
      ],
    };
  }
  const cacheFile = cacheFileFor(ref);
  try {
    const parsed: unknown = JSON.parse(readCacheFile(cacheFile));
    if (!isStartupWarmContextCache(parsed) || !matchesProject(parsed, ref)) throw new Error("Invalid cache structure or project identity.");
    const sanitized = sanitizeStartupWarmContextCache(parsed);
    if (startupWarmCacheHasForbiddenContent(sanitized)) throw new Error("Cache contains unsafe metadata.");
    const staleness = evaluateStaleness(sanitized, options);
    if (staleness === "invalid") throw new Error("Invalid cache freshness metadata or comparison options.");
    return {
      cache: { ...sanitized, staleness },
      found: true,
      staleness,
      evidence: [
        "startup-warm-context-store:read",
        "startup-warm-context-store:no-model-injection",
      ],
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {
      found: false, staleness: "unknown",
      evidence: ["startup-warm-context-store:missing-cache-safe", "startup-warm-context-store:discardable"],
    };
    return {
      found: false,
      staleness: "invalid",
      blocker: "Startup warm context cache is invalid or unreadable; rebuild the explicit local cache.",
      evidence: ["startup-warm-context-store:invalid-cache"],
    };
  }
}

export function writeStartupWarmContextCache(
  ref: StartupWarmContextCacheStoreRef,
  cache: StartupWarmContextCache,
): StartupWarmContextCacheWriteResult {
  ref = normalizeRef(ref);
  if (!storeRefIsWritable(ref)) {
    return {
      written: false,
      blocker: "Explicit writable project/cache root is required.",
      evidence: [
        "startup-warm-context-store:write-blocked",
        "startup-warm-context-store:explicit-roots-required",
      ],
    };
  }
  if (!isStartupWarmContextCache(cache) || !matchesProject(cache, ref) || cache.staleness === "invalid") {
    return { written: false, blocker: "Invalid cache structure or project identity.", evidence: ["startup-warm-context-store:invalid-cache"] };
  }
  const sanitized = sanitizeStartupWarmContextCache(cache);
  if (startupWarmCacheHasForbiddenContent(sanitized)) {
    return {
      written: false,
      blocker: "Startup warm cache contains raw content, secrets, or hidden reasoning.",
      evidence: ["startup-warm-context-store:forbidden-content-blocked"],
    };
  }
  const cacheFile = cacheFileFor(ref);
  try {
    writeCacheFile(cacheFile, `${JSON.stringify(sanitized, null, 2)}\n`);
  } catch {
    return { written: false, blocker: "Startup warm cache write could not be confirmed; inspect the explicit cache path before retrying.", evidence: ["startup-warm-context-store:write-failed"] };
  }
  return {
    written: true,
    cache: sanitized,
    cacheFile,
    evidence: [
      "startup-warm-context-store:write",
      "startup-warm-context-store:explicit-local",
      "startup-warm-context-store:discardable",
      "startup-warm-context-store:no-provider-call",
      "startup-warm-context-store:no-auto-injection",
    ],
  };
}

export function checkStartupWarmContextCacheHealth(
  ref: StartupWarmContextCacheStoreRef,
  options: StartupWarmContextCacheHealthOptions = {},
): StartupWarmContextCacheHealth {
  return projectStartupWarmContextCacheHealth(ref, readStartupWarmContextCache(ref, options));
}

/** Keep health and displayed content tied to the same disk observation. */
export function projectStartupWarmContextCacheHealth(
  ref: StartupWarmContextCacheStoreRef,
  read: StartupWarmContextCacheReadResult,
): StartupWarmContextCacheHealth {
  const normalized = normalizeRef(ref);
  if (normalized.mode === "disabled" || !storeRefIsUsable(normalized)) {
    return {
      mode: normalized.mode,
      ok: normalized.mode === "disabled",
      writable: false,
      found: false,
      staleness: "unknown",
      detail: "No explicit startup warm cache project/cache root configured.",
      evidence: [
        "startup-warm-context-health:disabled-or-unconfigured",
        "startup-warm-context-health:no-default-path",
      ],
    };
  }
  return {
    mode: normalized.mode,
    ok: read.staleness !== "invalid",
    writable: storeRefIsWritable(normalized),
    found: read.found,
    staleness: read.staleness,
    cacheRoot: normalized.cacheRoot,
    cacheFile: cacheFileFor(normalized),
    detail: read.blocker ?? (read.found
      ? `Startup warm cache is ${read.staleness}.`
      : "Startup warm cache is missing; this is safe because the cache is discardable."),
    evidence: [
      ...read.evidence,
      "startup-warm-context-health:checked",
      "startup-warm-context-health:discardable",
    ],
  };
}

function normalizeRef(ref: StartupWarmContextCacheStoreRef): StartupWarmContextCacheStoreRef {
  return {
    ...ref,
    projectRoot: ref.projectRoot ? path.resolve(ref.projectRoot) : undefined,
    cacheRoot: ref.cacheRoot ? path.resolve(ref.cacheRoot) : undefined,
    cacheFile: ref.cacheFile ? path.resolve(ref.cacheFile) : undefined,
  };
}

function storeRefIsUsable(ref: StartupWarmContextCacheStoreRef): boolean {
  return Boolean(ref.projectRoot && (ref.cacheRoot || ref.cacheFile));
}

function storeRefIsWritable(ref: StartupWarmContextCacheStoreRef): boolean {
  return (
    (ref.mode === "explicit-local" || ref.mode === "test-only") &&
    storeRefIsUsable(ref)
  );
}

function cacheFileFor(ref: StartupWarmContextCacheStoreRef): string {
  if (ref.cacheFile) {
    return ref.cacheFile;
  }
  if (!ref.cacheRoot || !ref.projectRoot) {
    throw new Error("Startup warm cache requires explicit cacheRoot and projectRoot.");
  }
  return path.join(ref.cacheRoot, `${projectRootHash(ref.projectRoot)}.startup-warm-context.json`);
}

function evaluateStaleness(
  cache: StartupWarmContextCache,
  options: StartupWarmContextCacheHealthOptions,
): StartupWarmContextStaleness {
  const created = Date.parse(cache.createdAt);
  if (!Number.isFinite(created) || cache.staleness === "invalid") return "invalid";
  const now = options.nowMs ?? Date.now();
  if (!Number.isFinite(now) || created > now || (options.ttlMs !== undefined && (!Number.isFinite(options.ttlMs) || options.ttlMs < 0))) return "invalid";
  if (options.currentSourceSignature !== undefined && (typeof options.currentSourceSignature !== "string" || !options.currentSourceSignature)) return "invalid";
  if (
    options.currentSourceSignature !== undefined &&
    cache.sourceSummary.sourceSignature !== options.currentSourceSignature
  ) {
    return "stale";
  }
  if (options.ttlMs !== undefined) {
    if (now - created > options.ttlMs) {
      return "stale";
    }
  }
  if (cache.staleness === "stale") return "stale";
  return options.currentSourceSignature !== undefined ? "fresh" : "unknown";
}

function matchesProject(cache: StartupWarmContextCache, ref: StartupWarmContextCacheStoreRef): boolean {
  return cache.projectRef.projectRootHash === projectRootHash(ref.projectRoot!)
    && (cache.projectRef.projectRoot === undefined || path.resolve(cache.projectRef.projectRoot) === ref.projectRoot);
}

function readCacheFile(cacheFile: string): string {
  const fd = fs.openSync(cacheFile, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0) | (fs.constants.O_NONBLOCK ?? 0));
  try {
    const stats = fs.fstatSync(fd);
    if (!stats.isFile() || stats.size > MAX_CACHE_BYTES) throw new Error("Cache is not a bounded regular file.");
    const bytes = Buffer.alloc(MAX_CACHE_BYTES + 1);
    let count = 0;
    while (count < bytes.length) {
      const read = fs.readSync(fd, bytes, count, bytes.length - count, null);
      if (read === 0) break;
      count += read;
    }
    if (count > MAX_CACHE_BYTES) throw new Error("Cache exceeds its byte limit.");
    return bytes.subarray(0, count).toString("utf8");
  } finally { fs.closeSync(fd); }
}

function writeCacheFile(cacheFile: string, content: string): void {
  if (Buffer.byteLength(content) > MAX_CACHE_BYTES) throw new Error("Cache exceeds its byte limit.");
  fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
  try {
    if (!fs.lstatSync(cacheFile).isFile()) throw new Error("Cache destination is not a regular file.");
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const temporary = `${cacheFile}.${randomUUID()}.tmp`;
  let ownedTemporary = false;
  try {
    const fd = fs.openSync(temporary, "wx", 0o600);
    ownedTemporary = true;
    try { fs.writeFileSync(fd, content, "utf8"); }
    finally { fs.closeSync(fd); }
    fs.renameSync(temporary, cacheFile);
    ownedTemporary = false;
  } finally {
    if (ownedTemporary) {
      try { fs.unlinkSync(temporary); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    }
  }
}
