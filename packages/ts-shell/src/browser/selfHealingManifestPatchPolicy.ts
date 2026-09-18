import type { BrowserSelfHealingManifestPatchKind } from "./selfHealingManifestPatch.js";

export type BrowserSelfHealingManifestPatchStatus =
  | "patch-allowed"
  | "patch-needs-explicit-manifest"
  | "patch-blocked-unsafe"
  | "patch-blocked-external-network"
  | "patch-blocked-global-scope"
  | "patch-blocked-unsupported"
  | "patch-not-applicable";

export interface BrowserSelfHealingManifestPatchPolicyDecision {
  readonly status: BrowserSelfHealingManifestPatchStatus;
  readonly allowed: boolean;
  readonly reason: string;
  readonly blockers: readonly string[];
  readonly warnings: readonly string[];
  readonly nextAction: string;
  readonly evidence: readonly string[];
}

export function decideBrowserSelfHealingManifestPatchPolicy(input: {
  readonly patchKind?: BrowserSelfHealingManifestPatchKind;
  readonly manifestPath?: string;
  readonly requestedOrigin?: string;
  readonly fixtureSummary?: string;
}): BrowserSelfHealingManifestPatchPolicyDecision {
  if (!input.patchKind || input.patchKind === "no-op-blocked") {
    return decision("patch-not-applicable", false, "No applicable manifest patch was requested.", ["missing-patch-kind"], [], "Provide a supported manifest patch proposal.");
  }
  if (!input.manifestPath) {
    return decision("patch-needs-explicit-manifest", false, "Manifest patching requires an explicit local/test manifest path.", ["missing-explicit-manifest"], [], "Pass --manifest <path> with a local/test manifest.");
  }
  const combined = [input.manifestPath, input.requestedOrigin ?? "", input.fixtureSummary ?? ""].join("\n");
  if (hasForbiddenContent(combined)) {
    return decision("patch-blocked-unsafe", false, "Manifest patch contains raw content or secret-looking data.", ["unsafe-manifest-patch-content"], [], "Remove raw evidence or secrets before patching.");
  }
  if (/\b(auth|payment|destructive|upload|download|screenshot|ocr|arbitrary-js|dynamic-discovery)\b/i.test(combined)) {
    return decision("patch-blocked-unsafe", false, "Manifest patch requests an unsafe browser capability.", ["unsafe-browser-capability"], [], "Keep manifest patches metadata-safe and local/test only.");
  }
  if (/^https?:\/\//i.test(input.requestedOrigin ?? "")) {
    return decision("patch-blocked-external-network", false, "External network allowlist patches are blocked.", ["external-network-origin"], [], "Use local-fixture origins only.");
  }
  if (input.manifestPath.includes("/.private-agents-real") || input.manifestPath.includes("/etc/") || input.manifestPath.includes("/usr/")) {
    return decision("patch-blocked-global-scope", false, "Manifest path appears global or provider-owned.", ["global-manifest-scope"], [], "Use an explicit temp or project local/test manifest.");
  }
  if (input.patchKind === "update-allowlist-local-fixture" && !(input.requestedOrigin ?? "local-fixture://route114").startsWith("local-fixture://")) {
    return decision("patch-blocked-external-network", false, "Allowlist patch must use local-fixture origin.", ["non-local-fixture-origin"], [], "Use local-fixture:// origins only.");
  }
  return decision("patch-allowed", true, "Manifest patch is local/test metadata only.", [], [], "Apply the manifest patch, then run replay explicitly if needed.");
}

function decision(
  status: BrowserSelfHealingManifestPatchStatus,
  allowed: boolean,
  reason: string,
  blockers: readonly string[],
  warnings: readonly string[],
  nextAction: string,
): BrowserSelfHealingManifestPatchPolicyDecision {
  return {
    status,
    allowed,
    reason,
    blockers,
    warnings,
    nextAction,
    evidence: [
      `browser-self-healing-manifest-patch-policy:${status}`,
      "browser-self-healing-manifest-patch-policy:local-test-only",
      "browser-self-healing-manifest-patch-policy:no-browser-execution",
    ],
  };
}

function hasForbiddenContent(value: string): boolean {
  return /(sk-[a-z0-9]|api[_-]?key|authorization:|bearer\s+[a-z0-9._-]+|password|secret|token|hidden reasoning|raw evidence|RAW_)/i.test(value);
}
