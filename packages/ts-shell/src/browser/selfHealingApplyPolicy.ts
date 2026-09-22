import type { BrowserSelfHealingProposalKind } from "./selfHealingProposal.js";

export type BrowserSelfHealingApplyStatus =
  | "apply-allowed"
  | "apply-needs-explicit-context"
  | "apply-needs-user-confirmation"
  | "apply-blocked-unsafe"
  | "apply-blocked-external-network"
  | "apply-blocked-unsupported"
  | "apply-not-applicable";

export interface BrowserSelfHealingApplyPolicyDecision {
  readonly status: BrowserSelfHealingApplyStatus;
  readonly applyable: boolean;
  readonly reason: string;
  readonly requiredContext: string;
  readonly requiresUserConfirmation: boolean;
  readonly blockers: readonly string[];
  readonly warnings: readonly string[];
  readonly nextAction: string;
  readonly evidence: readonly string[];
}

export function decideBrowserSelfHealingApplyPolicy(input: {
  readonly proposalKind?: BrowserSelfHealingProposalKind;
  readonly hasExplicitCacheContext?: boolean;
  readonly hasExplicitManifestContext?: boolean;
  readonly hasExplicitConfirmationContext?: boolean;
  readonly hasExplicitAllowlistContext?: boolean;
  readonly userConfirmed?: boolean;
}): BrowserSelfHealingApplyPolicyDecision {
  const kind = input.proposalKind;
  if (!kind) {
    return decision("apply-not-applicable", false, "No self-healing proposal kind was provided.", "proposal id", false, ["missing-proposal-kind"], [], "Provide an explicit proposal id.");
  }
  if (kind === "reject-unsafe-evidence") {
    return decision("apply-blocked-unsafe", false, "Unsafe evidence cannot be self-healed by apply.", "safe sanitized record", false, ["unsafe-evidence-blocked"], [], "Discard the unsafe record and create a new sanitized local/test action.");
  }
  if (kind === "external-network-blocked") {
    return decision("apply-blocked-external-network", false, "External network targets are outside metadata-safe apply.", "external-network-design", false, ["external-network-blocked"], [], "Keep replay local/test scoped.");
  }
  if (kind === "repair-cache") {
    if (!input.hasExplicitCacheContext) {
      return decision("apply-needs-explicit-context", false, "Cache repair requires an explicit writable receipt cache context.", "explicit receipt cache", true, ["missing-explicit-cache-context"], [], "Provide an explicit receipt cache store, then retry /browser repair apply.");
    }
    return confirmable(input.userConfirmed, "explicit receipt cache", "Repair sanitized cache metadata.");
  }
  if (kind === "request-confirmation") {
    if (!input.hasExplicitConfirmationContext) {
      return decision("apply-needs-explicit-context", false, "Confirmation apply requires explicit local/test command context.", "explicit confirmation context", true, ["missing-explicit-confirmation-context"], [], "Provide explicit local/test confirmation context.");
    }
    return confirmable(input.userConfirmed, "explicit confirmation context", "Record local/test confirmation metadata in command context.");
  }
  if (kind === "update-allowlist") {
    if (!input.hasExplicitAllowlistContext) {
      return decision("apply-needs-explicit-context", false, "Allowlist apply requires explicit local/test allowlist context.", "explicit local/test allowlist", true, ["missing-explicit-allowlist-context"], [], "Provide explicit local/test allowlist context.");
    }
    return confirmable(input.userConfirmed, "explicit local/test allowlist", "Update local/test allowlist metadata in explicit context.");
  }
  if (
    kind === "add-runner-binding" ||
    kind === "add-skill-metadata" ||
    kind === "refresh-fixture" ||
    kind === "retry-local-runner"
  ) {
    if (!input.hasExplicitManifestContext) {
      return decision("apply-needs-explicit-context", false, "Runner, skill, fixture, and retry metadata apply require an explicit local/test manifest context.", "explicit local/test manifest", true, ["missing-explicit-manifest-context"], [], "Provide an explicit local/test manifest context.");
    }
    return confirmable(input.userConfirmed, "explicit local/test manifest", "Patch explicit local/test manifest metadata.");
  }
  return decision("apply-blocked-unsupported", false, "Unsupported self-healing proposal kind.", "supported proposal kind", false, ["unsupported-proposal-kind"], [], "Use a supported browser self-healing proposal.");
}

function confirmable(
  userConfirmed: boolean | undefined,
  requiredContext: string,
  reason: string,
): BrowserSelfHealingApplyPolicyDecision {
  if (!userConfirmed) {
    return decision("apply-needs-user-confirmation", false, reason, requiredContext, true, ["missing-explicit-user-confirmation"], [], "Pass explicit apply confirmation.");
  }
  return decision("apply-allowed", true, reason, requiredContext, true, [], [], "Apply the metadata-safe repair, then run replay explicitly if needed.");
}

function decision(
  status: BrowserSelfHealingApplyStatus,
  applyable: boolean,
  reason: string,
  requiredContext: string,
  requiresUserConfirmation: boolean,
  blockers: readonly string[],
  warnings: readonly string[],
  nextAction: string,
): BrowserSelfHealingApplyPolicyDecision {
  return {
    status,
    applyable,
    reason,
    requiredContext,
    requiresUserConfirmation,
    blockers,
    warnings,
    nextAction,
    evidence: [
      `browser-self-healing-apply-policy:${status}`,
      "browser-self-healing-apply-policy:explicit-only",
      "browser-self-healing-apply-policy:no-browser-execution",
      "browser-self-healing-apply-policy:no-automatic-replay",
    ],
  };
}
