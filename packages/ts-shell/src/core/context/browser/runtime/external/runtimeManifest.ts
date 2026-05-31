import {
  createBrowserRuntimeManifest,
  normalizeOriginLike,
  validateBrowserRuntimeManifest,
  type BrowserRuntimeAllowedAction,
  type BrowserRuntimeManifestLoadResult,
  type BrowserRuntimeSnapshotCapability,
} from "../core/manifest.js";
import { sanitizeBrowserText } from "../../../browserCapabilityModel.js";

export type BrowserExternalRuntimeManifestVersion = "browser-external-runtime-manifest/v1";
export type BrowserExternalRuntimeMode = "external-process" | "skill-managed" | "simulated";
export type BrowserExternalRuntimeManifestSource = "cli-harness" | "explicit-local-config" | "test-only";

export interface BrowserExternalRuntimeManifest {
  readonly version: BrowserExternalRuntimeManifestVersion;
  readonly manifestId: string;
  readonly source: BrowserExternalRuntimeManifestSource;
  readonly runtimeMode: BrowserExternalRuntimeMode;
  readonly runnerCommand?: string;
  readonly runnerArgs: readonly string[];
  readonly skillBindingId?: string;
  readonly allowedOrigins: readonly string[];
  readonly allowedActions: readonly BrowserRuntimeAllowedAction[];
  readonly blockedActions: readonly string[];
  readonly snapshotCapabilities: readonly BrowserRuntimeSnapshotCapability[];
  readonly timeoutMs: number;
  readonly outputBudgetChars: number;
  readonly sessionPersistence: false;
  readonly browserLaunchAllowed: "explicit-controlled-only";
  readonly publicAutomationAllowed: false;
  readonly evidenceRedactionPolicy: "safe-summary-only";
  readonly warnings: readonly string[];
}

export type BrowserExternalRuntimeManifestLoadResult =
  | {
      readonly status: "valid";
      readonly manifest: BrowserExternalRuntimeManifest;
      readonly runtimeManifest: BrowserRuntimeManifestLoadResult;
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

export function createBrowserExternalRuntimeManifest(input: {
  readonly manifestId?: string;
  readonly source?: BrowserExternalRuntimeManifestSource;
  readonly runtimeMode?: BrowserExternalRuntimeMode;
  readonly runnerCommand?: string;
  readonly runnerArgs?: readonly string[];
  readonly skillBindingId?: string;
  readonly allowedOrigins?: readonly string[];
  readonly allowedActions?: readonly BrowserRuntimeAllowedAction[];
  readonly snapshotCapabilities?: readonly BrowserRuntimeSnapshotCapability[];
  readonly timeoutMs?: number;
  readonly outputBudgetChars?: number;
  readonly warnings?: readonly string[];
} = {}): BrowserExternalRuntimeManifest {
  const runtimeMode = input.runtimeMode ?? "external-process";
  return {
    version: "browser-external-runtime-manifest/v1",
    manifestId: sanitizeId(input.manifestId ?? `browser-external-runtime:${runtimeMode}`),
    source: input.source ?? "test-only",
    runtimeMode,
    runnerCommand: input.runnerCommand ? sanitizeBrowserText(input.runnerCommand, 260) : undefined,
    runnerArgs: input.runnerArgs?.map((arg) => sanitizeBrowserText(arg, 260)) ?? [],
    skillBindingId: input.skillBindingId ? sanitizeId(input.skillBindingId) : undefined,
    allowedOrigins: (input.allowedOrigins ?? ["controlled-runtime://route124"]).map(normalizeOriginLike),
    allowedActions: input.allowedActions ?? ["navigate", "observe", "extract", "click", "type"],
    blockedActions: ["auth", "payment", "destructive", "upload", "download", "screenshot", "ocr", "arbitrary-js"],
    snapshotCapabilities: input.snapshotCapabilities ?? ["dom", "accessibility", "text", "links"],
    timeoutMs: Math.max(100, Math.min(30_000, input.timeoutMs ?? 5_000)),
    outputBudgetChars: Math.max(200, Math.min(24_000, input.outputBudgetChars ?? 4_000)),
    sessionPersistence: false,
    browserLaunchAllowed: "explicit-controlled-only",
    publicAutomationAllowed: false,
    evidenceRedactionPolicy: "safe-summary-only",
    warnings: [
      ...(input.warnings ?? []),
      "browser-external-runtime-manifest:controlled-only",
      "browser-external-runtime-manifest:no-default-runtime",
    ],
  };
}

export function validateBrowserExternalRuntimeManifest(
  manifest: BrowserExternalRuntimeManifest | undefined,
): BrowserExternalRuntimeManifestLoadResult {
  if (!manifest) {
    return {
      status: "missing",
      reason: "No explicit external browser runtime manifest was supplied.",
      evidence: ["browser-external-runtime-manifest:missing", "browser-external-runtime-manifest:no-default-runtime"],
      warnings: [],
      redactions: [],
    };
  }
  const runtimeManifest = validateBrowserRuntimeManifest(createBrowserRuntimeManifest({
    manifestId: manifest.manifestId,
    source: manifest.source,
    runtimeMode: manifest.runtimeMode === "external-process"
      ? "external-browser-runtime"
      : manifest.runtimeMode === "skill-managed"
        ? "skill-managed-browser-runtime"
        : "simulated-browser-runtime",
    allowedOrigins: manifest.allowedOrigins,
    allowedActions: manifest.allowedActions,
    snapshotCapabilities: manifest.snapshotCapabilities,
    timeoutMs: manifest.timeoutMs,
    outputBudgetChars: manifest.outputBudgetChars,
    warnings: manifest.warnings,
  }));
  const blockers: string[] = [];
  if (manifest.version !== "browser-external-runtime-manifest/v1") {
    blockers.push("unsupported external runtime manifest version");
  }
  if (manifest.sessionPersistence !== false || manifest.publicAutomationAllowed !== false) {
    blockers.push("session persistence and public automation must be disabled");
  }
  if (manifest.runtimeMode === "external-process" && !manifest.runnerCommand) {
    blockers.push("external-process runtime requires an explicit runner command");
  }
  if (manifest.runtimeMode === "skill-managed" && !manifest.skillBindingId) {
    blockers.push("skill-managed runtime requires explicit binding id");
  }
  if (runtimeManifest.status !== "valid") {
    blockers.push(runtimeManifest.reason);
  }
  if (blockers.length > 0) {
    return {
      status: "invalid",
      reason: sanitizeBrowserText(blockers.join("; "), 260),
      evidence: ["browser-external-runtime-manifest:invalid", ...runtimeManifest.evidence],
      warnings: runtimeManifest.warnings,
      redactions: runtimeManifest.redactions,
    };
  }
  return {
    status: "valid",
    manifest,
    runtimeManifest,
    reason: "Explicit external browser runtime manifest is valid.",
    evidence: [
      "browser-external-runtime-manifest:valid",
      `browser-external-runtime-manifest:mode:${manifest.runtimeMode}`,
      ...runtimeManifest.evidence,
    ],
    warnings: runtimeManifest.warnings,
    redactions: runtimeManifest.redactions,
  };
}

function sanitizeId(value: string): string {
  return sanitizeBrowserText(value, 140)
    .toLowerCase()
    .replace(/[^a-z0-9:._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "browser-external-runtime";
}
