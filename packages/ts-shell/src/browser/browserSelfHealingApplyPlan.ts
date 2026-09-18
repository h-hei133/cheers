import { sanitizeBrowserText } from "./browserCapabilityModel.js";
import {
  decideBrowserSelfHealingApplyPolicy,
  type BrowserSelfHealingApplyPolicyDecision,
} from "./browserSelfHealingApplyPolicy.js";
import type {
  BrowserSelfHealingProposalId,
  BrowserSelfHealingProposalKind,
} from "./browserSelfHealingProposal.js";

export type BrowserSelfHealingApplyTarget =
  | "cache"
  | "manifest"
  | "confirmation"
  | "allowlist"
  | "runner-binding"
  | "skill-metadata"
  | "fixture"
  | "none";

export interface BrowserSelfHealingApplyPlan {
  readonly applyPlanId: string;
  readonly proposalId: BrowserSelfHealingProposalId;
  readonly proposalKind?: BrowserSelfHealingProposalKind;
  readonly applyStatus: BrowserSelfHealingApplyPolicyDecision["status"];
  readonly target: BrowserSelfHealingApplyTarget;
  readonly intendedMetadataChanges: readonly string[];
  readonly requiredExplicitContext: string;
  readonly requiredUserConfirmation: boolean;
  readonly risks: readonly string[];
  readonly blockers: readonly string[];
  readonly warnings: readonly string[];
  readonly applied: false;
  readonly browserActionExecuted: false;
  readonly replayExecuted: false;
  readonly nextAction: string;
  readonly evidence: readonly string[];
}

export function planBrowserSelfHealingApply(input: {
  readonly proposalId: string;
  readonly proposalKind?: BrowserSelfHealingProposalKind;
  readonly hasExplicitCacheContext?: boolean;
  readonly hasExplicitManifestContext?: boolean;
  readonly hasExplicitConfirmationContext?: boolean;
  readonly hasExplicitAllowlistContext?: boolean;
  readonly userConfirmed?: boolean;
}): BrowserSelfHealingApplyPlan {
  const policy = decideBrowserSelfHealingApplyPolicy(input);
  return {
    applyPlanId: deterministicApplyPlanId(input.proposalId),
    proposalId: safe(input.proposalId, 220),
    proposalKind: input.proposalKind,
    applyStatus: policy.status,
    target: targetForProposal(input.proposalKind),
    intendedMetadataChanges: intendedChanges(input.proposalKind),
    requiredExplicitContext: policy.requiredContext,
    requiredUserConfirmation: policy.requiresUserConfirmation,
    risks: risksForProposal(input.proposalKind),
    blockers: policy.blockers,
    warnings: policy.warnings,
    applied: false,
    browserActionExecuted: false,
    replayExecuted: false,
    nextAction: policy.nextAction,
    evidence: [
      ...policy.evidence,
      "browser-self-healing-apply-plan:metadata-only",
      "browser-self-healing-apply-plan:no-filesystem-write",
    ],
  };
}

export function inferBrowserSelfHealingProposalKindFromId(
  proposalId: string,
): BrowserSelfHealingProposalKind | undefined {
  if (proposalId.includes("missing-runner-binding")) {
    return "add-runner-binding";
  }
  if (proposalId.includes("missing-skill-metadata")) {
    return "add-skill-metadata";
  }
  if (proposalId.includes("sandbox-or-confirmation-missing")) {
    return "request-confirmation";
  }
  if (proposalId.includes("corrupted-cache-record") || proposalId.includes("missing-cache-entry")) {
    return "repair-cache";
  }
  if (proposalId.includes("allowlist-blocked")) {
    return "update-allowlist";
  }
  if (proposalId.includes("stale-fixture")) {
    return "refresh-fixture";
  }
  if (proposalId.includes("timeout") || proposalId.includes("malformed-response")) {
    return "retry-local-runner";
  }
  if (proposalId.includes("unsafe-evidence")) {
    return "reject-unsafe-evidence";
  }
  if (proposalId.includes("external-url-blocked")) {
    return "external-network-blocked";
  }
  return undefined;
}

function deterministicApplyPlanId(proposalId: string): string {
  return `browser-self-healing-apply-plan:${safe(proposalId, 180).replace(/^browser-self-healing-proposal:/, "")}`;
}

function targetForProposal(
  proposalKind?: BrowserSelfHealingProposalKind,
): BrowserSelfHealingApplyTarget {
  if (proposalKind === "repair-cache") {
    return "cache";
  }
  if (proposalKind === "request-confirmation") {
    return "confirmation";
  }
  if (proposalKind === "update-allowlist") {
    return "allowlist";
  }
  if (proposalKind === "add-runner-binding" || proposalKind === "retry-local-runner") {
    return "runner-binding";
  }
  if (proposalKind === "add-skill-metadata") {
    return "skill-metadata";
  }
  if (proposalKind === "refresh-fixture") {
    return "fixture";
  }
  return "none";
}

function intendedChanges(proposalKind?: BrowserSelfHealingProposalKind): readonly string[] {
  if (proposalKind === "repair-cache") {
    return ["repair sanitized receipt cache records"];
  }
  if (proposalKind === "request-confirmation") {
    return ["record local/test confirmation in explicit command context"];
  }
  if (proposalKind === "update-allowlist") {
    return ["update local/test allowlist metadata in explicit context"];
  }
  if (proposalKind === "add-runner-binding") {
    return ["add local/test runner binding metadata to explicit manifest"];
  }
  if (proposalKind === "add-skill-metadata") {
    return ["add sanitized skill runner metadata to explicit manifest"];
  }
  if (proposalKind === "refresh-fixture") {
    return ["refresh local/test fixture metadata"];
  }
  if (proposalKind === "retry-local-runner") {
    return ["reset local/test retry metadata"];
  }
  return ["none"];
}

function risksForProposal(proposalKind?: BrowserSelfHealingProposalKind): readonly string[] {
  if (!proposalKind || proposalKind === "reject-unsafe-evidence" || proposalKind === "external-network-blocked") {
    return ["apply would exceed metadata-safe boundary"];
  }
  return ["applied metadata is not replay authority"];
}

function safe(value: string, maxLength = 180): string {
  return sanitizeBrowserText(value.replace(/\s+/g, " "), maxLength);
}
