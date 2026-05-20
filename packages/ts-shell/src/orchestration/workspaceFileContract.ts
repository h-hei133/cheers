export type WorkspaceTargetKind =
  | "explicit-target"
  | "candidate-target"
  | "missing-target"
  | "ambiguous-target"
  | "out-of-workspace-target";

export type WorkspaceAuthorityMode = "read" | "write";

export type WorkspaceAuthorityDecision =
  | "available"
  | "blocked"
  | "not-authorized"
  | "not-applicable";

export type StaleReadStatus =
  | "passed"
  | "blocked"
  | "precondition-missing"
  | "not-checked";

export type VerificationPreconditionStatus =
  | "ready"
  | "missing"
  | "not-applicable";

export interface WorkspaceFactSummary {
  readonly workspaceRoot: string;
  readonly workspaceLabel: string;
  readonly projectRoot?: string;
  readonly projectLabel?: string;
}

export interface WorkspaceTargetFact {
  readonly kind: WorkspaceTargetKind;
  readonly safeLabel: string;
  readonly targetPath?: string;
  readonly targetHint?: string;
  readonly candidates: readonly string[];
  readonly evidence: readonly string[];
}

export interface WorkspaceAuthorityFact {
  readonly mode: WorkspaceAuthorityMode;
  readonly decision: WorkspaceAuthorityDecision;
  readonly reasonCode: string;
  readonly targetLabel: string;
  readonly evidence: readonly string[];
}

export interface StaleReadFact {
  readonly status: StaleReadStatus;
  readonly targetLabel: string;
  readonly reasonCode: string;
  readonly evidence: readonly string[];
}

export interface VerificationPreconditionFact {
  readonly status: VerificationPreconditionStatus;
  readonly targetLabel: string;
  readonly required: readonly string[];
  readonly missing: readonly string[];
  readonly evidence: readonly string[];
}

export function buildWorkspaceFactSummary(input: {
  readonly workspaceRoot: string;
  readonly projectRoot?: string;
}): WorkspaceFactSummary {
  return {
    workspaceRoot: input.workspaceRoot,
    workspaceLabel: safeTargetLabel(input.workspaceRoot),
    ...(input.projectRoot
      ? {
          projectRoot: input.projectRoot,
          projectLabel: safeTargetLabel(input.projectRoot),
        }
      : {}),
  };
}

export function buildWorkspaceTargetFact(input: {
  readonly kind: WorkspaceTargetKind;
  readonly targetPath?: string;
  readonly targetHint?: string;
  readonly candidates?: readonly string[];
  readonly evidence?: readonly string[];
}): WorkspaceTargetFact {
  const candidates = (input.candidates ?? [])
    .map(safeTargetLabel)
    .filter((candidate) => candidate.length > 0);
  const targetPath = input.targetPath ? normalizePathLike(input.targetPath) : undefined;
  const targetHint = input.targetHint ? safeTargetLabel(input.targetHint) : undefined;
  const safeLabel =
    targetPath ??
    targetHint ??
    (candidates.length > 0 ? candidates.join(", ") : "(missing-target)");

  return {
    kind: input.kind,
    safeLabel,
    ...(targetPath ? { targetPath } : {}),
    ...(targetHint ? { targetHint } : {}),
    candidates,
    evidence: input.evidence ?? [`workspace-file-target:${input.kind}`],
  };
}

export function buildReadAuthorityFact(input: {
  readonly targetPath?: string;
  readonly decision: Extract<
    WorkspaceAuthorityDecision,
    "available" | "blocked" | "not-applicable"
  >;
  readonly reasonCode?: string;
  readonly evidence?: readonly string[];
}): WorkspaceAuthorityFact {
  return {
    mode: "read",
    decision: input.decision,
    reasonCode: input.reasonCode ?? input.decision,
    targetLabel: safeTargetLabel(input.targetPath ?? "(missing-target)"),
    evidence: input.evidence ?? [`workspace-read-authority:${input.decision}`],
  };
}

export function buildWriteAuthorityFact(input: {
  readonly targetPath?: string;
  readonly decision: Extract<
    WorkspaceAuthorityDecision,
    "available" | "blocked" | "not-authorized" | "not-applicable"
  >;
  readonly reasonCode?: string;
  readonly evidence?: readonly string[];
}): WorkspaceAuthorityFact {
  return {
    mode: "write",
    decision: input.decision,
    reasonCode: input.reasonCode ?? input.decision,
    targetLabel: safeTargetLabel(input.targetPath ?? "(missing-target)"),
    evidence: input.evidence ?? [`workspace-write-authority:${input.decision}`],
  };
}

export function buildStaleReadFact(input: {
  readonly targetPath?: string;
  readonly status: StaleReadStatus;
  readonly reasonCode?: string;
  readonly evidence?: readonly string[];
}): StaleReadFact {
  return {
    status: input.status,
    targetLabel: safeTargetLabel(input.targetPath ?? "(missing-target)"),
    reasonCode: input.reasonCode ?? input.status,
    evidence: input.evidence ?? [`workspace-stale-read:${input.status}`],
  };
}

export function buildVerificationPreconditionFact(input: {
  readonly targetPath?: string;
  readonly required?: readonly string[];
  readonly satisfied?: readonly string[];
}): VerificationPreconditionFact {
  const required = input.required ?? [];
  const satisfied = new Set(input.satisfied ?? []);
  const missing = required.filter((item) => !satisfied.has(item));
  const status =
    required.length === 0 ? "not-applicable" : missing.length === 0 ? "ready" : "missing";

  return {
    status,
    targetLabel: safeTargetLabel(input.targetPath ?? "(missing-target)"),
    required,
    missing,
    evidence: [
      `workspace-verification-precondition:${status}`,
      ...missing.map((item) => `workspace-verification-precondition:missing:${item}`),
    ],
  };
}

export function safeTargetLabel(value: string | undefined): string {
  if (!value) {
    return "";
  }
  return redactSensitiveText(normalizePathLike(value));
}

export function normalizePathLike(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.\/+/g, "").trim();
}

function redactSensitiveText(value: string): string {
  return value
    .replace(/\/home\/wang\/\.private-agents-real(?:\/[^\s]*)?/g, "[private-real-home]")
    .replace(
      /[A-Za-z]:\/Users\/[^/\s]+\/\.private-agents-real(?:\/[^\s]*)?/gi,
      "[private-real-home]",
    )
    .replace(
      /\b(api[_-]?key|token|secret|password|authorization|cookie)=([^\s,;]+)/gi,
      "$1=[redacted]",
    )
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [redacted]");
}
