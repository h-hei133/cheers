import { sanitizeBrowserText } from "./capabilityModel.js";

export type BrowserSelfHealingManifestPatchKind =
  | "add-runner-binding"
  | "add-skill-metadata"
  | "update-allowlist-local-fixture"
  | "refresh-fixture-summary"
  | "add-confirmation-local-context-reference"
  | "no-op-blocked";

export type BrowserSelfHealingManifestKind =
  | "external-runner"
  | "skill-runner"
  | "local-fixture"
  | "receipt-cache"
  | "unknown";

export interface BrowserSelfHealingManifestPatch {
  readonly patchId: string;
  readonly proposalId: string;
  readonly patchKind: BrowserSelfHealingManifestPatchKind;
  readonly targetManifestKind: BrowserSelfHealingManifestKind;
  readonly targetManifestPathSummary: string;
  readonly intendedChanges: readonly string[];
  readonly validationRequirements: readonly string[];
  readonly blockers: readonly string[];
  readonly warnings: readonly string[];
  readonly applied: false;
  readonly browserExecuted: false;
  readonly replayExecuted: false;
  readonly evidence: readonly string[];
}

export function createBrowserSelfHealingManifestPatch(input: {
  readonly proposalId: string;
  readonly patchKind: BrowserSelfHealingManifestPatchKind;
  readonly targetManifestKind?: BrowserSelfHealingManifestKind;
  readonly manifestPath?: string;
  readonly blockers?: readonly string[];
  readonly warnings?: readonly string[];
}): BrowserSelfHealingManifestPatch {
  return {
    patchId: `browser-self-healing-manifest-patch:${safe(input.proposalId, 140)}:${input.patchKind}`,
    proposalId: safe(input.proposalId, 220),
    patchKind: input.patchKind,
    targetManifestKind: input.targetManifestKind ?? "unknown",
    targetManifestPathSummary: summarizePath(input.manifestPath),
    intendedChanges: intendedChanges(input.patchKind),
    validationRequirements: [
      "load explicit manifest",
      "validate before patch",
      "apply sanitized metadata patch",
      "validate after patch",
      "atomic temp-file rename",
    ],
    blockers: input.blockers ?? [],
    warnings: input.warnings ?? [],
    applied: false,
    browserExecuted: false,
    replayExecuted: false,
    evidence: [
      `browser-self-healing-manifest-patch:${input.patchKind}`,
      "browser-self-healing-manifest-patch:explicit-local-test-only",
      "browser-self-healing-manifest-patch:no-browser-execution",
      "browser-self-healing-manifest-patch:no-automatic-replay",
    ],
  };
}

function intendedChanges(kind: BrowserSelfHealingManifestPatchKind): readonly string[] {
  if (kind === "add-runner-binding") {
    return ["add sanitized runner binding reference to explicit local/test manifest"];
  }
  if (kind === "add-skill-metadata") {
    return ["add sanitized skill runner metadata to explicit local/test manifest"];
  }
  if (kind === "update-allowlist-local-fixture") {
    return ["add local-fixture origin to explicit local/test allowlist metadata"];
  }
  if (kind === "refresh-fixture-summary") {
    return ["refresh sanitized fixture summary metadata"];
  }
  if (kind === "add-confirmation-local-context-reference") {
    return ["record local/test confirmation context reference"];
  }
  return ["none"];
}

function summarizePath(value?: string): string {
  if (!value) {
    return "none";
  }
  const parts = value.split(/[\\/]+/).filter(Boolean);
  return safe(parts.slice(-2).join("/"), 160);
}

function safe(value: string, maxLength = 180): string {
  return sanitizeBrowserText(value.replace(/\s+/g, " "), maxLength);
}
