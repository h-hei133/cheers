import type { VerificationResultObservation } from "../../verification/result/boundary.js";
import type { ProductRepairIterationProjection } from "../iteration/projection.js";

export type RepairabilityStatus =
  | "repair_required"
  | "repair_possible"
  | "repair_not_available"
  | "unsupported"
  | "not_proven";

export type RepairProposalSource =
  | "deterministic_from_failure_evidence"
  | "deterministic_from_product_read_evidence"
  | "existing_repair_owner_projection"
  | "fake_default_safe"
  | "unavailable";

export type RepairApplyObservationStatus =
  | "not_applied"
  | "authority_required"
  | "applied"
  | "failed"
  | "blocked"
  | "unsupported"
  | "not_proven";

export type PostRepairVerificationObservationStatus =
  | "not_run"
  | "passed"
  | "failed"
  | "blocked"
  | "unsupported"
  | "not_proven";

export interface RepairRequiredHandoff {
  readonly handoffId: string;
  readonly sourceVerificationId: string;
  readonly failureClass: string;
  readonly originalFailurePreserved: true;
  readonly repairabilityStatus: RepairabilityStatus;
  readonly suggestedRepairMode: "proposal_only" | "existing_owner" | "unsupported" | "unknown";
  readonly authorityRequirement: "required" | "not_required" | "unknown";
  readonly redactionStatus: "report-safe" | "redacted";
  readonly notProvenClaims: readonly string[];
  readonly terminalSuccessClaim: false;
}

export interface RepairProposalObservation {
  readonly proposalId: string;
  readonly sourceFailureId: string;
  readonly proposalSource: RepairProposalSource;
  readonly targetSummary: string;
  readonly readinessStatus: "exact_ready" | "partial" | "not_ready" | "unknown";
  readonly authorityRequirement: "required" | "not_required" | "unknown";
  readonly applyStatus: RepairApplyObservationStatus;
  readonly redactionStatus: "report-safe" | "redacted";
  readonly notProvenClaims: readonly string[];
  readonly terminalSuccessClaim: false;
}

export interface RepairApplyObservation {
  readonly repairApplyId: string;
  readonly proposalId: string;
  readonly repairApplyStatus: RepairApplyObservationStatus;
  readonly repairAuthorityStatus: "required" | "granted" | "denied" | "not_required" | "unknown";
  readonly postRepairVerificationStatus: PostRepairVerificationObservationStatus;
  readonly originalFailurePreserved: true;
  readonly redactionStatus: "report-safe" | "redacted";
  readonly notProvenClaims: readonly string[];
  readonly terminalSuccessClaim: false;
}

export function projectRepairRequiredHandoff(input: {
  readonly verification: VerificationResultObservation;
  readonly repairabilityStatus?: RepairabilityStatus;
  readonly suggestedRepairMode?: RepairRequiredHandoff["suggestedRepairMode"];
  readonly authorityRequirement?: RepairRequiredHandoff["authorityRequirement"];
  readonly notProvenClaims?: readonly string[];
}): RepairRequiredHandoff {
  const redactions = new Set<string>();
  return freeze({
    handoffId: sanitizeId(`${input.verification.verificationId}:repair-required`, redactions),
    sourceVerificationId: sanitizeText(input.verification.verificationId, redactions, 180),
    failureClass: sanitizeText(input.verification.failureClass ?? "verification-failed", redactions, 120),
    originalFailurePreserved: true,
    repairabilityStatus: input.repairabilityStatus ??
      (input.verification.status === "failed" ? "repair_required" : "not_proven"),
    suggestedRepairMode: input.suggestedRepairMode ?? "proposal_only",
    authorityRequirement: input.authorityRequirement ?? "required",
    redactionStatus:
      redactions.size > 0 || input.verification.redactionStatus === "redacted"
        ? "redacted"
        : "report-safe",
    notProvenClaims: unique([
      "terminal-success",
      "task-success",
      "repair-success",
      "verification-success",
      "repair-required-is-not-success",
      "original-failure-preserved",
      ...(input.verification.notProvenClaims ?? []),
      ...(input.notProvenClaims ?? []),
    ], redactions),
    terminalSuccessClaim: false,
  });
}

export function observeRepairProposal(input: {
  readonly handoff: RepairRequiredHandoff;
  readonly proposalSource?: RepairProposalSource;
  readonly targetSummary?: string;
  readonly readinessStatus?: RepairProposalObservation["readinessStatus"];
  readonly authorityRequirement?: RepairProposalObservation["authorityRequirement"];
  readonly applyStatus?: RepairApplyObservationStatus;
  readonly repairIteration?: ProductRepairIterationProjection;
  readonly notProvenClaims?: readonly string[];
}): RepairProposalObservation {
  const redactions = new Set<string>();
  const targetSummary = input.targetSummary ??
    (input.repairIteration?.changedFiles.length
      ? `changedFiles=${input.repairIteration.changedFiles.length}`
      : "proposal target not available");
  return freeze({
    proposalId: sanitizeId(`${input.handoff.handoffId}:proposal`, redactions),
    sourceFailureId: sanitizeText(input.handoff.handoffId, redactions, 180),
    proposalSource: input.proposalSource ??
      (input.repairIteration ? "existing_repair_owner_projection" : "unavailable"),
    targetSummary: sanitizeText(targetSummary, redactions, 180),
    readinessStatus: input.readinessStatus ?? "unknown",
    authorityRequirement: input.authorityRequirement ?? input.handoff.authorityRequirement,
    applyStatus: input.applyStatus ?? applyStatusFromIteration(input.repairIteration),
    redactionStatus:
      redactions.size > 0 || input.handoff.redactionStatus === "redacted"
        ? "redacted"
        : "report-safe",
    notProvenClaims: unique([
      "terminal-success",
      "task-success",
      "repair-success",
      "repair-proposal-is-not-success",
      "repair-continuation-is-not-success",
      ...(input.repairIteration?.notProvenClaims ?? []),
      ...(input.notProvenClaims ?? []),
    ], redactions),
    terminalSuccessClaim: false,
  });
}

export function observeRepairApply(input: {
  readonly proposal: RepairProposalObservation;
  readonly repairApplyStatus?: RepairApplyObservationStatus;
  readonly repairAuthorityStatus?: RepairApplyObservation["repairAuthorityStatus"];
  readonly postRepairVerificationStatus?: PostRepairVerificationObservationStatus;
  readonly repairIteration?: ProductRepairIterationProjection;
  readonly notProvenClaims?: readonly string[];
}): RepairApplyObservation {
  const redactions = new Set<string>();
  const repairApplyStatus = input.repairApplyStatus ??
    applyStatusFromIteration(input.repairIteration);
  const postRepairVerificationStatus = input.postRepairVerificationStatus ??
    postRepairStatusFromIteration(input.repairIteration);
  return freeze({
    repairApplyId: sanitizeId(`${input.proposal.proposalId}:apply`, redactions),
    proposalId: sanitizeText(input.proposal.proposalId, redactions, 180),
    repairApplyStatus,
    repairAuthorityStatus: input.repairAuthorityStatus ??
      (repairApplyStatus === "authority_required" ? "required" : "unknown"),
    postRepairVerificationStatus,
    originalFailurePreserved: true,
    redactionStatus:
      redactions.size > 0 || input.proposal.redactionStatus === "redacted"
        ? "redacted"
        : "report-safe",
    notProvenClaims: unique([
      "terminal-success",
      "task-success",
      "repair-success",
      "verification-success",
      "repair-apply-without-post-repair-verification-is-not-success",
      "post-repair-verification-observed-is-not-terminal-success",
      ...(input.repairIteration?.notProvenClaims ?? []),
      ...(input.notProvenClaims ?? []),
    ], redactions),
    terminalSuccessClaim: false,
  });
}

function applyStatusFromIteration(
  iteration?: ProductRepairIterationProjection,
): RepairApplyObservationStatus {
  if (!iteration) return "not_applied";
  if (
    iteration.applyStatus === "hunk-set-applied" ||
    iteration.applyStatus === "single-target-applied" ||
    iteration.applyStatus === "target-set-applied"
  ) {
    return "applied";
  }
  if (iteration.applyStatus.includes("blocked")) return "blocked";
  if (iteration.applyStatus.includes("failed")) return "failed";
  return "not_proven";
}

function postRepairStatusFromIteration(
  iteration?: ProductRepairIterationProjection,
): PostRepairVerificationObservationStatus {
  if (!iteration) return "not_run";
  if (iteration.postRepairVerificationStatus === "passed") return "passed";
  if (iteration.postRepairVerificationStatus === "failed") return "failed";
  if (iteration.postRepairVerificationStatus === "blocked") return "blocked";
  return "not_proven";
}

function unique(values: readonly string[], redactions: Set<string>): readonly string[] {
  return freeze(Array.from(new Set(values.map((value) => sanitizeText(value, redactions, 120)))).sort());
}

function sanitizeId(value: string, redactions: Set<string>): string {
  return sanitizeText(value, redactions, 180)
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function sanitizeText(value: string, redactions: Set<string>, maxLength: number): string {
  let sanitized = value
    .replace(/\/home\/wang\/\.private-agents-real[^\s"'`]*/g, "[redacted-real-provider-home]")
    .replace(/\b(Bearer)\s+[A-Za-z0-9._~+/=-]+/gi, "$1 [redacted]")
    .replace(/\b(api[_-]?key|token|secret|cookie|authorization|password)\b\s*[:=]\s*\S+/gi, "$1=[redacted]")
    .replace(/\b(sk-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g, "[secret-redacted]")
    .replace(/\bprovider\.env\b[^\n\r]*/gi, "provider.env=[redacted]")
    .replace(/\boldText[:=][\s\S]*?(?=\snewText[:=]|$)/gi, "oldText=[raw-content-excluded]")
    .replace(/\bnewText[:=][^\n\r]*/gi, "newText=[raw-content-excluded]")
    .replace(/\braw provider output[:=][^\n\r]*/gi, "raw-provider-output=[raw-content-excluded]")
    .replace(/\bhidden reasoning[:=]?[^\n\r]*/gi, "hidden-reasoning=[raw-content-excluded]")
    .replace(/<html[\s\S]*?<\/html>/gi, "[raw-content-excluded]")
    .replace(/\s+/g, " ")
    .trim();
  if (sanitized !== value.trim()) {
    redactions.add("unsafe-content");
  }
  if (sanitized.length > maxLength) {
    sanitized = `${sanitized.slice(0, maxLength)}...`;
    redactions.add("truncated");
  }
  return sanitized;
}

function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      freeze(child);
    }
  }
  return value;
}
