export type ApprovalDecisionProvenanceKind =
  | "approved"
  | "denied"
  | "skipped"
  | "not-required"
  | "escalation-denied";

export type ApprovalDecisionProvenanceSource =
  | "tool-result-metadata"
  | "sandbox-enforcer"
  | "not-required";

export interface ApprovalDecisionProvenance {
  readonly kind: ApprovalDecisionProvenanceKind;
  readonly source: ApprovalDecisionProvenanceSource;
  readonly legacyOutcome: "approved" | "denied";
  readonly wasEscalated?: boolean;
}

export interface ApprovalDecisionProvenanceInput {
  readonly metadata?: Record<string, unknown>;
}

export function deriveApprovalDecisionProvenance(
  input: ApprovalDecisionProvenanceInput,
): ApprovalDecisionProvenance {
  const explicitKind = normalizeApprovalDecisionKind(
    input.metadata?.approvalDecisionKind,
  );
  if (explicitKind) {
    return {
      kind: explicitKind,
      source: "tool-result-metadata",
      legacyOutcome: toLegacyApprovalOutcome(explicitKind),
      wasEscalated: readBoolean(input.metadata?.wasEscalated),
    };
  }

  const wasEscalated = readBoolean(input.metadata?.wasEscalated);
  if (wasEscalated === true) {
    return {
      kind: "escalation-denied",
      source: "sandbox-enforcer",
      legacyOutcome: "denied",
      wasEscalated,
    };
  }

  return {
    kind: "approved",
    source: "not-required",
    legacyOutcome: "approved",
    wasEscalated,
  };
}

export function toLegacyApprovalOutcome(
  kind: ApprovalDecisionProvenanceKind,
): "approved" | "denied" {
  switch (kind) {
    case "denied":
    case "escalation-denied":
      return "denied";
    case "approved":
    case "skipped":
    case "not-required":
      return "approved";
  }
}

function normalizeApprovalDecisionKind(
  value: unknown,
): ApprovalDecisionProvenanceKind | undefined {
  return value === "approved" ||
    value === "denied" ||
    value === "skipped" ||
    value === "not-required" ||
    value === "escalation-denied"
    ? value
    : undefined;
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}
