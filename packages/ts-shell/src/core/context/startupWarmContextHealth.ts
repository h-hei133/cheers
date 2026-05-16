import fs from "node:fs";
import path from "node:path";
import {
  STARTUP_WARM_CONTEXT_CACHE_VERSION,
  projectRootHash,
  sanitizeStartupWarmContextCache,
  startupWarmCacheHasForbiddenContent,
  type StartupWarmContextCache,
  type StartupWarmContextCacheMode,
  type StartupWarmContextStaleness,
} from "./startupWarmContextCache.js";

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
  if (!storeRefIsUsable(ref)) {
    return {
      found: false,
      staleness: "unknown",
      blocker: "Explicit project root and cache root are required.",
      evidence: [
        "startup-warm-context-store:explicit-roots-required",
        "startup-warm-context-store:no-default-path",
      ],
    };
  }
  const cacheFile = cacheFileFor(ref);
  if (!fs.existsSync(cacheFile)) {
    return {
      found: false,
      staleness: "unknown",
      evidence: [
        "startup-warm-context-store:missing-cache-safe",
        "startup-warm-context-store:discardable",
      ],
    };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(cacheFile, "utf8")) as StartupWarmContextCache;
    const sanitized = sanitizeStartupWarmContextCache(parsed);
    const staleness = evaluateStaleness(sanitized, options);
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
    return {
      found: false,
      staleness: "invalid",
      blocker: error instanceof Error ? error.message : "Invalid startup warm context cache.",
      evidence: ["startup-warm-context-store:invalid-cache"],
    };
  }
}

export function writeStartupWarmContextCache(
  ref: StartupWarmContextCacheStoreRef,
  cache: StartupWarmContextCache,
): StartupWarmContextCacheWriteResult {
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
  const sanitized = sanitizeStartupWarmContextCache(cache);
  if (startupWarmCacheHasForbiddenContent(sanitized)) {
    return {
      written: false,
      blocker: "Startup warm cache contains raw content, secrets, or hidden reasoning.",
      evidence: ["startup-warm-context-store:forbidden-content-blocked"],
    };
  }
  const cacheFile = cacheFileFor(ref);
  fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
  fs.writeFileSync(cacheFile, `${JSON.stringify(sanitized, null, 2)}\n`, "utf8");
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
  const normalized = normalizeRef(ref);
  if (!storeRefIsUsable(normalized)) {
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
  const read = readStartupWarmContextCache(normalized, options);
  return {
    mode: normalized.mode,
    ok: read.staleness !== "invalid",
    writable: storeRefIsWritable(normalized),
    found: read.found,
    staleness: read.staleness,
    cacheRoot: normalized.cacheRoot,
    cacheFile: cacheFileFor(normalized),
    detail: read.found
      ? `Startup warm cache is ${read.staleness}.`
      : "Startup warm cache is missing; this is safe because the cache is discardable.",
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
  if (cache.cacheVersion !== STARTUP_WARM_CONTEXT_CACHE_VERSION) {
    return "invalid";
  }
  if (
    options.currentSourceSignature &&
    cache.sourceSummary.sourceSignature !== options.currentSourceSignature
  ) {
    return "stale";
  }
  if (options.ttlMs !== undefined && options.nowMs !== undefined) {
    const created = Date.parse(cache.createdAt);
    if (!Number.isFinite(created)) {
      return "invalid";
    }
    if (options.nowMs - created > options.ttlMs) {
      return "stale";
    }
  }
  return "fresh";
}
