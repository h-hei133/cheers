import type { RuntimeEvidenceSavePoint } from "../evidence/savepoint/model.js";
import type { RepairApplyObservation, RepairProposalObservation, RepairRequiredHandoff } from "../repair/handoff/boundary.js";
import type { SessionTreeProjection } from "../session/sessionTreeProjection.js";
import type { SessionContextRebuildProjection } from "./sessionContextRebuildProjection.js";
import type { NextTurnBundleProjection } from "../turn/nextTurnBundle.js";
import type { ToolResultMessageBatch } from "../turn/toolResultMessage.js";
import type { VerificationLoopIntent, VerificationResultObservation } from "../verification/result/boundary.js";

export interface LoopContextRebuildInput {
  readonly rebuildInputId: string;
  readonly sourceSessionId: string;
  readonly activePathProjectionId: string;
  readonly nextTurnBundleId?: string;
  readonly savePointId?: string;
  readonly toolResultMessageIds: readonly string[];
  readonly verificationHandoffIds: readonly string[];
  readonly repairHandoffIds: readonly string[];
  readonly providerMetadataIds: readonly string[];
  readonly resourceMetadataIds: readonly string[];
  readonly packageMetadataIds: readonly string[];
  readonly includedFactsSummary: readonly string[];
  readonly excludedFactsSummary: readonly string[];
  readonly missingFacts: readonly string[];
  readonly redaction: {
    readonly status: "report-safe" | "redacted";
    readonly excluded: readonly string[];
  };
  readonly notProvenClaims: readonly string[];
  readonly terminalSuccessClaim: false;
}

const REDACTION_EXCLUSIONS = [
  "api-keys",
  "provider.env",
  "auth-headers",
  "raw-provider-output",
  "oldText",
  "newText",
  "unredacted-command-output",
  "hidden-reasoning",
  "transcript-dumps",
  "unsafe-file-contents",
] as const;

export function buildLoopContextRebuildInput(input: {
  readonly sessionProjection: SessionTreeProjection;
  readonly contextRebuildProjection?: SessionContextRebuildProjection;
  readonly nextTurnBundle?: NextTurnBundleProjection;
  readonly savePoint?: RuntimeEvidenceSavePoint;
  readonly toolResultMessages?: ToolResultMessageBatch;
  readonly verificationIntents?: readonly VerificationLoopIntent[];
  readonly verificationResults?: readonly VerificationResultObservation[];
  readonly repairRequiredHandoffs?: readonly RepairRequiredHandoff[];
  readonly repairProposals?: readonly RepairProposalObservation[];
  readonly repairApplyObservations?: readonly RepairApplyObservation[];
  readonly providerMetadataIds?: readonly string[];
  readonly resourceMetadataIds?: readonly string[];
  readonly packageMetadataIds?: readonly string[];
  readonly missingFacts?: readonly string[];
}): LoopContextRebuildInput {
  const redactions = new Set<string>();
  const activePathProjectionId = `${input.sessionProjection.sessionIdentity}:active-path:${input.sessionProjection.activeLeafId}`;
  const verificationHandoffIds = [
    ...(input.verificationIntents ?? []).map((item) => item.intentId),
    ...(input.verificationResults ?? []).map((item) => item.verificationId),
  ];
  const repairHandoffIds = [
    ...(input.repairRequiredHandoffs ?? []).map((item) => item.handoffId),
    ...(input.repairProposals ?? []).map((item) => item.proposalId),
    ...(input.repairApplyObservations ?? []).map((item) => item.repairApplyId),
  ];
  const missingFacts = [
    ...(input.missingFacts ?? []),
    ...(input.contextRebuildProjection?.missingRequiredFacts ?? []),
    ...(input.contextRebuildProjection?.missingOptionalFacts ?? []),
    ...(input.sessionProjection.branchSupport !== "storage-backed"
      ? ["storage-backed-branch-navigation"]
      : []),
    ...(input.sessionProjection.compaction.records.length === 0
      ? ["storage-backed-compaction"]
      : []),
    ...input.sessionProjection.branchFacts.missingParentIds.map((id) => `branch-parent-missing:${id}`),
    ...(input.sessionProjection.branchFacts.activeLeafResolution === "missing"
      ? ["active-leaf-missing"]
      : []),
    ...input.sessionProjection.compaction.records.flatMap((record) => record.missingFactIds),
    ...input.sessionProjection.compaction.records.flatMap((record) => record.unsafeInputIds),
    ...input.sessionProjection.compaction.records.flatMap((record) => record.unsupportedFactIds),
  ];

  return deepFreeze({
    rebuildInputId: sanitizeId(`context-rebuild-input:${activePathProjectionId}`, redactions),
    sourceSessionId: sanitizeText(input.sessionProjection.sessionIdentity, redactions, 160),
    activePathProjectionId: sanitizeText(activePathProjectionId, redactions, 180),
    ...(input.nextTurnBundle
      ? { nextTurnBundleId: sanitizeText(input.nextTurnBundle.bundleId, redactions, 180) }
      : {}),
    ...(input.savePoint ? { savePointId: sanitizeText(input.savePoint.id, redactions, 180) } : {}),
    toolResultMessageIds: freeze(
      (input.toolResultMessages?.messages.map((message) => message.messageId) ?? [])
        .map((id) => sanitizeText(id, redactions, 180)),
    ),
    verificationHandoffIds: freeze(verificationHandoffIds.map((id) => sanitizeText(id, redactions, 180))),
    repairHandoffIds: freeze(repairHandoffIds.map((id) => sanitizeText(id, redactions, 180))),
    providerMetadataIds: freeze((input.providerMetadataIds ?? []).map((id) => sanitizeText(id, redactions, 180))),
    resourceMetadataIds: freeze((input.resourceMetadataIds ?? []).map((id) => sanitizeText(id, redactions, 180))),
    packageMetadataIds: freeze((input.packageMetadataIds ?? []).map((id) => sanitizeText(id, redactions, 180))),
    includedFactsSummary: freeze([
      `activePath=${input.sessionProjection.activePathProjection.pathLength}`,
      `activeLeaf=${input.sessionProjection.activePathProjection.activeLeafResolution}`,
      `branch=${input.sessionProjection.branchSupport}`,
      `compaction=${input.sessionProjection.compaction.availability}`,
      `nextTurnBundle=${input.nextTurnBundle ? "available" : "missing"}`,
      `savePoint=${input.savePoint ? "available" : "missing"}`,
      `toolResultMessages=${input.toolResultMessages?.messages.length ?? 0}`,
      `verificationHandoffs=${verificationHandoffIds.length}`,
      `repairHandoffs=${repairHandoffIds.length}`,
    ].map((item) => sanitizeText(item, redactions, 160))),
    excludedFactsSummary: freeze([
      "raw-transcript-content",
      "raw-provider-output",
      "unsafe-file-contents",
      "unredacted-command-output",
      "raw-edit-content",
    ]),
    missingFacts: freeze(Array.from(new Set(missingFacts.map((fact) => sanitizeText(fact, redactions, 160))))),
    redaction: {
      status:
        redactions.size > 0 ||
          input.nextTurnBundle?.redaction.status === "redacted" ||
          input.savePoint?.redaction.status === "redacted"
          ? "redacted"
          : "report-safe",
      excluded: REDACTION_EXCLUSIONS,
    },
    notProvenClaims: unique([
      "terminal-success",
      "task-success",
      "context-completeness",
      "continuation-success",
      "active-path-projected-is-not-success",
      "context-rebuild-input-is-not-success",
      ...input.sessionProjection.terminal.notProvenClaims,
      ...(input.nextTurnBundle?.notProvenClaims ?? []),
      ...(input.savePoint?.notProvenClaims ?? []),
    ], redactions),
    terminalSuccessClaim: false,
  });
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

function deepFreeze<T>(value: T): T {
  return freeze(value);
}
