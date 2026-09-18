import { sanitizeBrowserText } from "../../../core/context/browserCapabilityModel.js";
import type { BrowserExecutionRequest } from "../../../core/context/browserExecutionContract.js";
import type { BrowserExternalRuntimeManifestLoadResult } from "../external/runtimeManifest.js";
import { browserRuntimeActionAllowed, browserRuntimeOriginAllowed } from "./manifest.js";

export type BrowserRuntimeAdapterPolicyStatus =
  | "allowed"
  | "blocked-missing-manifest"
  | "blocked-invalid-manifest"
  | "blocked-public-origin"
  | "blocked-unsafe-action"
  | "blocked-credential-url"
  | "blocked-unsupported-action";

export interface BrowserRuntimeAdapterPolicyDecision {
  readonly status: BrowserRuntimeAdapterPolicyStatus;
  readonly allowed: boolean;
  readonly reason: string;
  readonly nextAction: string;
  readonly warnings: readonly string[];
  readonly evidence: readonly string[];
}

export function decideBrowserRuntimeAdapterPolicy(input: {
  readonly request: BrowserExecutionRequest;
  readonly manifestLoad: BrowserExternalRuntimeManifestLoadResult;
}): BrowserRuntimeAdapterPolicyDecision {
  if (input.manifestLoad.status === "missing") {
    return decision("blocked-missing-manifest", input.manifestLoad.reason, "Provide an explicit controlled adapter manifest.");
  }
  if (input.manifestLoad.status === "invalid") {
    return decision("blocked-invalid-manifest", input.manifestLoad.reason, "Fix the adapter manifest without enabling public automation.");
  }
  const validLoad = input.manifestLoad as Extract<BrowserExternalRuntimeManifestLoadResult, { readonly status: "valid" }>;
  const manifest = validLoad.manifest;
  if (!browserRuntimeActionAllowed({
    version: "browser-runtime-manifest/v1",
    manifestId: manifest.manifestId,
    source: manifest.source,
    runtimeMode: "external-browser-runtime",
    allowedOrigins: manifest.allowedOrigins,
    allowedActions: manifest.allowedActions,
    blockedActions: manifest.blockedActions,
    snapshotCapabilities: manifest.snapshotCapabilities,
    jsRenderedSupport: true,
    sessionPersistence: false,
    cookiesAuth: "disabled",
    timeoutMs: manifest.timeoutMs,
    outputBudgetChars: manifest.outputBudgetChars,
    evidenceRedactionPolicy: "safe-summary-only",
    warnings: manifest.warnings,
    rawContent: "excluded",
  }, input.request.actionKind)) {
    return decision("blocked-unsupported-action", `Action ${input.request.actionKind} is not allowed by the adapter manifest.`, "Use an allowed controlled action.");
  }
  if (["auth", "payment", "destructive", "upload", "download", "screenshot"].includes(input.request.actionKind)) {
    return decision("blocked-unsafe-action", `Action ${input.request.actionKind} is blocked for runtime adapters.`, "Keep unsafe actions blocked.");
  }
  const target = input.request.action.url ??
    (input.request.actionKind === "navigate" ? input.request.action.target : undefined) ??
    manifest.allowedOrigins[0];
  if (/^[a-z]+:\/\/[^/]*:[^/]*@/i.test(target ?? "")) {
    return decision("blocked-credential-url", "Credential URLs are blocked.", "Use credential-free controlled origins only.");
  }
  const runtimeManifest = validLoad.runtimeManifest.status === "valid" ? validLoad.runtimeManifest.manifest : undefined;
  if (!runtimeManifest || !browserRuntimeOriginAllowed(runtimeManifest, target)) {
    return decision("blocked-public-origin", "Public browser automation is blocked for runtime adapters.", "Use controlled-runtime, local-fixture, or loopback origins.");
  }
  return decision("allowed", "Explicit controlled runtime adapter action is allowed.", "Run adapter and validate snapshots before surfacing output.");
}

function decision(
  status: BrowserRuntimeAdapterPolicyStatus,
  reason: string,
  nextAction: string,
): BrowserRuntimeAdapterPolicyDecision {
  return {
    status,
    allowed: status === "allowed",
    reason: sanitizeBrowserText(reason, 240),
    nextAction: sanitizeBrowserText(nextAction, 240),
    warnings: status === "allowed" ? [] : [status],
    evidence: [
      `browser-runtime-adapter-policy:${status}`,
      "browser-runtime-adapter-policy:no-public-automation",
      "browser-runtime-adapter-policy:no-provider-or-model-call",
    ],
  };
}
