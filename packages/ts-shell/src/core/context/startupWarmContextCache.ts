import { createHash } from "node:crypto";

export const STARTUP_WARM_CONTEXT_CACHE_VERSION = 1 as const;

export type StartupWarmContextCacheMode = "disabled" | "explicit-local" | "test-only";
export type StartupWarmContextStaleness = "fresh" | "stale" | "invalid" | "unknown";

export interface StartupWarmContextProjectRef {
  readonly projectRoot?: string;
  readonly projectRootHash: string;
}

export interface StartupWarmContextSourceSummary {
  readonly sourceSignature: string;
  readonly sources: readonly string[];
  readonly generatedFrom: readonly string[];
}

export interface StartupWarmContextSection {
  readonly status: "available" | "missing" | "stale" | "blocked";
  readonly summary: string;
  readonly evidence: readonly string[];
}

export interface StartupWarmContextCache {
  readonly cacheVersion: typeof STARTUP_WARM_CONTEXT_CACHE_VERSION;
  readonly cacheMode: StartupWarmContextCacheMode;
  readonly projectRef: StartupWarmContextProjectRef;
  readonly createdAt: string;
  readonly sourceSummary: StartupWarmContextSourceSummary;
  readonly editCapabilitySummary: StartupWarmContextSection;
  readonly compactSummary: StartupWarmContextSection;
  readonly memoryWakeupSummary: StartupWarmContextSection;
  readonly validationSummary: StartupWarmContextSection;
  readonly routePhaseSummary: StartupWarmContextSection;
  readonly redactions: readonly string[];
  readonly warnings: readonly string[];
  readonly staleness: StartupWarmContextStaleness;
  readonly safety: {
    readonly injectedIntoModel: false;
    readonly startupAutoLoad: false;
    readonly providerCall: "none";
    readonly vectorStore: "none";
    readonly rawContent: "excluded";
    readonly discardable: true;
  };
}

export interface StartupWarmContextCacheInput {
  readonly cacheMode: StartupWarmContextCacheMode;
  readonly projectRoot?: string;
  readonly createdAt: string;
  readonly sourceSummary: StartupWarmContextSourceSummary;
  readonly editCapabilitySummary: StartupWarmContextSection;
  readonly compactSummary: StartupWarmContextSection;
  readonly memoryWakeupSummary: StartupWarmContextSection;
  readonly validationSummary: StartupWarmContextSection;
  readonly routePhaseSummary: StartupWarmContextSection;
  readonly redactions?: readonly string[];
  readonly warnings?: readonly string[];
  readonly staleness?: StartupWarmContextStaleness;
}

export function buildStartupWarmContextCache(
  input: StartupWarmContextCacheInput,
): StartupWarmContextCache {
  const cache = {
    cacheVersion: STARTUP_WARM_CONTEXT_CACHE_VERSION,
    cacheMode: input.cacheMode,
    projectRef: {
      projectRoot: input.projectRoot,
      projectRootHash: projectRootHash(input.projectRoot ?? "unknown-project-root"),
    },
    createdAt: input.createdAt,
    sourceSummary: input.sourceSummary,
    editCapabilitySummary: input.editCapabilitySummary,
    compactSummary: input.compactSummary,
    memoryWakeupSummary: input.memoryWakeupSummary,
    validationSummary: input.validationSummary,
    routePhaseSummary: input.routePhaseSummary,
    redactions: dedupe(input.redactions ?? []),
    warnings: dedupe(input.warnings ?? []),
    staleness: input.staleness ?? "fresh",
    safety: {
      injectedIntoModel: false,
      startupAutoLoad: false,
      providerCall: "none",
      vectorStore: "none",
      rawContent: "excluded",
      discardable: true,
    },
  } satisfies StartupWarmContextCache;
  return sanitizeStartupWarmContextCache(cache);
}

export function sanitizeStartupWarmContextCache(
  cache: StartupWarmContextCache,
): StartupWarmContextCache {
  const redactions = new Set(cache.redactions);
  const sanitize = (value: string) => sanitizeWarmCacheText(value, redactions);
  return {
    ...cache,
    sourceSummary: {
      ...cache.sourceSummary,
      sources: cache.sourceSummary.sources.map(sanitize),
      generatedFrom: cache.sourceSummary.generatedFrom.map(sanitize),
    },
    editCapabilitySummary: sanitizeSection(cache.editCapabilitySummary, sanitize),
    compactSummary: sanitizeSection(cache.compactSummary, sanitize),
    memoryWakeupSummary: sanitizeSection(cache.memoryWakeupSummary, sanitize),
    validationSummary: sanitizeSection(cache.validationSummary, sanitize),
    routePhaseSummary: sanitizeSection(cache.routePhaseSummary, sanitize),
    redactions: Array.from(redactions).sort(),
    warnings: dedupe(cache.warnings.map(sanitize)),
  };
}

export function computeStartupWarmSourceSignature(
  values: readonly string[],
): string {
  return createHash("sha256")
    .update(values.map((value) => sanitizeWarmCacheText(value)).join("\n---\n"))
    .digest("hex")
    .slice(0, 24);
}

export function projectRootHash(projectRoot: string): string {
  return createHash("sha256").update(projectRoot).digest("hex").slice(0, 16);
}

export function sanitizeWarmCacheText(
  value: string,
  redactions: Set<string> = new Set(),
  maxLength = 420,
): string {
  const compact = value.replace(/\s+/g, " ").trim();
  let sanitized = compact
    .replace(/\b(sk-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g, () => {
      redactions.add("secret-looking-token");
      return "[REDACTED_SECRET]";
    })
    .replace(/\b(api key|token|authorization|provider credential|provider config)\b/gi, () => {
      redactions.add("secret-label");
      return "[REDACTED_SECRET_LABEL]";
    })
    .replace(/\bRAW_[A-Z0-9_]+\b/g, () => {
      redactions.add("raw-marker");
      return "[REDACTED_RAW]";
    })
    .replace(/\braw (file|recovery|content) content\b/gi, () => {
      redactions.add("raw-content-label");
      return "[REDACTED_RAW_CONTENT]";
    })
    .replace(/\b(hidden reasoning|chain[- ]?of[- ]?thought)\b/gi, () => {
      redactions.add("hidden-reasoning-label");
      return "[REDACTED_REASONING]";
    });
  if (sanitized.length > maxLength) {
    sanitized = `${sanitized.slice(0, maxLength - 3)}...`;
  }
  return sanitized;
}

export function startupWarmCacheHasForbiddenContent(
  cache: StartupWarmContextCache,
): boolean {
  const encoded = JSON.stringify(cache);
  return (
    /\b(sk-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/.test(encoded) ||
    /\bRAW_[A-Z0-9_]+\b/.test(encoded) ||
    /\b(hidden reasoning|chain[- ]?of[- ]?thought)\b/i.test(encoded)
  );
}

function sanitizeSection(
  section: StartupWarmContextSection,
  sanitize: (value: string) => string,
): StartupWarmContextSection {
  return {
    ...section,
    summary: sanitize(section.summary),
    evidence: dedupe(section.evidence.map(sanitize)),
  };
}

function dedupe(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}
