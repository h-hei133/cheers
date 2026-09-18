import { sanitizeBrowserText } from "./browserCapabilityModel.js";

export type BrowserSelfHealingPatchKind =
  | "runner-binding-patch"
  | "skill-metadata-patch"
  | "confirmation-patch"
  | "cache-repair-patch"
  | "allowlist-patch"
  | "fixture-refresh-patch"
  | "no-op-blocked-patch";

export type BrowserSelfHealingPatchStatus = "proposal-only" | "blocked";

export interface BrowserSelfHealingPatch {
  readonly patchId: string;
  readonly kind: BrowserSelfHealingPatchKind;
  readonly status: BrowserSelfHealingPatchStatus;
  readonly target: string;
  readonly summary: string;
  readonly deterministicSerialization: string;
  readonly wouldWrite: "no";
  readonly cacheWrite: "no";
  readonly metadataMutation: "no";
  readonly unsafe: boolean;
  readonly blockers: readonly string[];
  readonly evidence: readonly string[];
}

export function createBrowserSelfHealingPatch(input: {
  readonly proposalId: string;
  readonly kind: BrowserSelfHealingPatchKind;
  readonly target: string;
  readonly summary: string;
  readonly blockers?: readonly string[];
}): BrowserSelfHealingPatch {
  const rawUnsafe = containsForbiddenContent(`${input.target} ${input.summary}`);
  const target = safe(input.target || "none");
  const summary = safe(input.summary || "No proposal details available.");
  const unsafe = input.kind === "no-op-blocked-patch" || rawUnsafe || containsForbiddenContent(`${target} ${summary}`);
  const blockers = [
    ...(input.blockers ?? []),
    ...(unsafe ? ["unsafe-patch-content-blocked"] : []),
  ];
  const status: BrowserSelfHealingPatchStatus = blockers.length > 0 || unsafe ? "blocked" : "proposal-only";
  const patchId = `${input.proposalId}:patch:${input.kind}`;
  return {
    patchId,
    kind: input.kind,
    status,
    target,
    summary,
    deterministicSerialization: [
      `patch=${patchId}`,
      `kind=${input.kind}`,
      `target=${target}`,
      `status=${status}`,
      "wouldWrite=no",
    ].join("|"),
    wouldWrite: "no",
    cacheWrite: "no",
    metadataMutation: "no",
    unsafe,
    blockers,
    evidence: [
      `browser-self-healing-patch:${input.kind}`,
      "browser-self-healing-patch:proposal-only",
      "browser-self-healing-patch:no-filesystem-write",
      "browser-self-healing-patch:no-cache-write",
    ],
  };
}

function safe(value: string): string {
  return sanitizeBrowserText(value.replace(/\s+/g, " "), 160);
}

function containsForbiddenContent(value: string): boolean {
  return /(sk-[a-z0-9]|api[_-]?key|authorization:|bearer\s+[a-z0-9._-]+|password|secret|token|hidden reasoning|raw evidence|RAW_)/i.test(value);
}
