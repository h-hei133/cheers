import { sanitizeBrowserText } from "../../../browserCapabilityModel.js";

export type BrowserRuntimeManifestVersion = "browser-runtime-manifest/v1";
export type BrowserRuntimeManifestSource = "cli-harness" | "explicit-local-config" | "test-only";
export type BrowserRuntimeMode =
  | "simulated-browser-runtime"
  | "external-browser-runtime"
  | "skill-managed-browser-runtime"
  | "direct-playwright-core"
  | "unavailable";
export type BrowserRuntimeAllowedAction = "navigate" | "observe" | "extract" | "click" | "type";
export type BrowserRuntimeSnapshotCapability = "dom" | "accessibility" | "text" | "links";

export interface BrowserRuntimeManifest {
  readonly version: BrowserRuntimeManifestVersion;
  readonly manifestId: string;
  readonly source: BrowserRuntimeManifestSource;
  readonly runtimeMode: BrowserRuntimeMode;
  readonly allowedOrigins: readonly string[];
  readonly allowedActions: readonly BrowserRuntimeAllowedAction[];
  readonly blockedActions: readonly string[];
  readonly snapshotCapabilities: readonly BrowserRuntimeSnapshotCapability[];
  readonly jsRenderedSupport: boolean;
  readonly sessionPersistence: false;
  readonly cookiesAuth: "disabled";
  readonly timeoutMs: number;
  readonly outputBudgetChars: number;
  readonly evidenceRedactionPolicy: "safe-summary-only";
  readonly warnings: readonly string[];
  readonly rawContent: "excluded";
}

export type BrowserRuntimeManifestLoadResult =
  | {
      readonly status: "valid";
      readonly manifest: BrowserRuntimeManifest;
      readonly reason: string;
      readonly evidence: readonly string[];
      readonly warnings: readonly string[];
      readonly redactions: readonly string[];
    }
  | {
      readonly status: "missing" | "invalid";
      readonly reason: string;
      readonly evidence: readonly string[];
      readonly warnings: readonly string[];
      readonly redactions: readonly string[];
    };

export function createBrowserRuntimeManifest(input: {
  readonly manifestId?: string;
  readonly source?: BrowserRuntimeManifestSource;
  readonly runtimeMode?: BrowserRuntimeMode;
  readonly allowedOrigins?: readonly string[];
  readonly allowedActions?: readonly BrowserRuntimeAllowedAction[];
  readonly snapshotCapabilities?: readonly BrowserRuntimeSnapshotCapability[];
  readonly jsRenderedSupport?: boolean;
  readonly timeoutMs?: number;
  readonly outputBudgetChars?: number;
  readonly warnings?: readonly string[];
} = {}): BrowserRuntimeManifest {
  const runtimeMode = input.runtimeMode ?? "simulated-browser-runtime";
  return {
    version: "browser-runtime-manifest/v1",
    manifestId: sanitizeId(input.manifestId ?? `browser-runtime:${runtimeMode}`),
    source: input.source ?? "test-only",
    runtimeMode,
    allowedOrigins: unique((input.allowedOrigins ?? ["controlled-runtime://route123"]).map(normalizeOriginLike)),
    allowedActions: unique(input.allowedActions ?? ["navigate", "observe", "extract", "click", "type"]),
    blockedActions: ["auth", "payment", "destructive", "upload", "download", "screenshot", "ocr", "arbitrary-js"],
    snapshotCapabilities: unique(input.snapshotCapabilities ?? ["dom", "accessibility", "text", "links"]),
    jsRenderedSupport: input.jsRenderedSupport ?? true,
    sessionPersistence: false,
    cookiesAuth: "disabled",
    timeoutMs: clampNumber(input.timeoutMs ?? 5_000, 100, 30_000),
    outputBudgetChars: clampNumber(input.outputBudgetChars ?? 4_000, 200, 24_000),
    evidenceRedactionPolicy: "safe-summary-only",
    warnings: unique([
      ...(input.warnings ?? []),
      "browser-runtime-manifest:controlled-local-test-only",
      "browser-runtime-manifest:no-session-persistence",
      "browser-runtime-manifest:no-raw-content",
    ]),
    rawContent: "excluded",
  };
}

export function validateBrowserRuntimeManifest(
  manifest: BrowserRuntimeManifest | undefined,
): BrowserRuntimeManifestLoadResult {
  if (!manifest) {
    return {
      status: "missing",
      reason: "No explicit browser runtime manifest was supplied.",
      evidence: ["browser-runtime-manifest:missing", "browser-runtime-manifest:no-default-runtime"],
      warnings: [],
      redactions: [],
    };
  }
  const warnings = new Set<string>(manifest.warnings);
  const redactions = new Set<string>();
  const evidence = [
    "browser-runtime-manifest:explicit",
    `browser-runtime-manifest:mode:${manifest.runtimeMode}`,
    "browser-runtime-manifest:no-default-runtime",
    "browser-runtime-manifest:no-provider-or-model-call",
  ];
  const blockers: string[] = [];
  if (manifest.version !== "browser-runtime-manifest/v1") {
    blockers.push("unsupported manifest version");
  }
  if (manifest.sessionPersistence !== false) {
    blockers.push("session persistence must be disabled");
  }
  if (manifest.cookiesAuth !== "disabled") {
    blockers.push("cookies/auth must be disabled");
  }
  if (manifest.allowedOrigins.length === 0) {
    blockers.push("at least one controlled origin is required");
  }
  for (const origin of manifest.allowedOrigins) {
    const originDecision = classifyControlledOrigin(origin);
    if (originDecision.status !== "allowed") {
      blockers.push(originDecision.reason);
    }
    if (originDecision.redaction) {
      redactions.add(originDecision.redaction);
    }
  }
  for (const action of manifest.allowedActions) {
    if (!["navigate", "observe", "extract", "click", "type"].includes(action)) {
      blockers.push(`unsupported action ${action}`);
    }
  }
  if (!manifest.snapshotCapabilities.includes("dom") || !manifest.snapshotCapabilities.includes("accessibility")) {
    warnings.add("browser-runtime-manifest:limited-snapshot-capability");
  }
  if (blockers.length > 0) {
    return {
      status: "invalid",
      reason: sanitizeBrowserText(blockers.join("; "), 240),
      evidence,
      warnings: Array.from(warnings).sort(),
      redactions: Array.from(redactions).sort(),
    };
  }
  return {
    status: "valid",
    manifest,
    reason: "Explicit controlled browser runtime manifest is valid.",
    evidence,
    warnings: Array.from(warnings).sort(),
    redactions: Array.from(redactions).sort(),
  };
}

export function browserRuntimeOriginAllowed(
  manifest: BrowserRuntimeManifest,
  urlOrOrigin: string | undefined,
): boolean {
  const normalized = normalizeOriginLike(urlOrOrigin ?? "");
  return manifest.allowedOrigins.some((origin) => normalized === origin || normalized.startsWith(`${origin}/`));
}

export function browserRuntimeActionAllowed(
  manifest: BrowserRuntimeManifest,
  action: string,
): action is BrowserRuntimeAllowedAction {
  return manifest.allowedActions.includes(action as BrowserRuntimeAllowedAction);
}

export function normalizeOriginLike(value: string): string {
  const sanitized = sanitizeBrowserText(value.trim(), 240);
  if (!sanitized) {
    return "";
  }
  if (sanitized.startsWith("controlled-runtime://") || sanitized.startsWith("local-fixture://")) {
    return sanitized.replace(/\/+$/g, "");
  }
  try {
    const parsed = new URL(sanitized);
    return parsed.origin.toLowerCase();
  } catch {
    return sanitized.toLowerCase().replace(/\/+$/g, "");
  }
}

function classifyControlledOrigin(origin: string): {
  readonly status: "allowed" | "blocked";
  readonly reason: string;
  readonly redaction?: string;
} {
  if (origin === "*" || origin.includes("*")) {
    return { status: "blocked", reason: "wildcard origins are not allowed" };
  }
  if (origin.startsWith("controlled-runtime://") || origin.startsWith("local-fixture://")) {
    return { status: "allowed", reason: "controlled fixture origin" };
  }
  try {
    const parsed = new URL(origin);
    if (parsed.username || parsed.password) {
      return { status: "blocked", reason: "credential URLs are not allowed", redaction: "url-credentials" };
    }
    if (parsed.protocol !== "http:") {
      return { status: "blocked", reason: "only loopback http origins are allowed for this route" };
    }
    if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1" || parsed.hostname === "::1") {
      return { status: "allowed", reason: "controlled loopback origin" };
    }
    return { status: "blocked", reason: "public browser automation origins are blocked" };
  } catch {
    return { status: "blocked", reason: "invalid controlled origin" };
  }
}

function sanitizeId(value: string): string {
  return sanitizeBrowserText(value, 120)
    .toLowerCase()
    .replace(/[^a-z0-9:._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "browser-runtime:manifest";
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function unique<T extends string>(values: readonly T[]): readonly T[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}
