import { redactReportText } from "../core/security/redaction.js";
import { freezeDeep } from "../core/values/freeze.js";
import type { RuntimeEvidenceSavePoint } from "../evidence/savepoint/model.js";
import type { RepairApplyObservation, RepairProposalObservation, RepairRequiredHandoff } from "../repair/handoff/boundary.js";
import type { SessionTreeProjection } from "../session/sessionTreeProjection.js";
import type { SessionContextRebuildProjection } from "./sessionContextRebuildProjection.js";
import type { VerificationLoopIntent, VerificationResultObservation } from "../verification/result/boundary.js";

export interface NextTurnBundleLike {
  readonly bundleId: string;
  readonly redaction: { readonly status: "report-safe" | "redacted" | string };
  readonly notProvenClaims?: readonly string[];
}

export interface ToolResultMessageBatchLike {
  readonly messages: readonly { readonly messageId: string }[];
}

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
  readonly nextTurnBundle?: NextTurnBundleLike;
  readonly savePoint?: RuntimeEvidenceSavePoint;
  readonly toolResultMessages?: ToolResultMessageBatchLike;
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

  return freezeDeep({
    rebuildInputId: sanitizeId(`context-rebuild-input:${activePathProjectionId}`, redactions),
    sourceSessionId: sanitizeText(input.sessionProjection.sessionIdentity, redactions, 160),
    activePathProjectionId: sanitizeText(activePathProjectionId, redactions, 180),
    ...(input.nextTurnBundle
      ? { nextTurnBundleId: sanitizeText(input.nextTurnBundle.bundleId, redactions, 180) }
      : {}),
    ...(input.savePoint ? { savePointId: sanitizeText(input.savePoint.id, redactions, 180) } : {}),
    toolResultMessageIds: freezeDeep(
      (input.toolResultMessages?.messages.map((message) => message.messageId) ?? [])
        .map((id) => sanitizeText(id, redactions, 180)),
    ),
    verificationHandoffIds: freezeDeep(verificationHandoffIds.map((id) => sanitizeText(id, redactions, 180))),
    repairHandoffIds: freezeDeep(repairHandoffIds.map((id) => sanitizeText(id, redactions, 180))),
    providerMetadataIds: freezeDeep((input.providerMetadataIds ?? []).map((id) => sanitizeText(id, redactions, 180))),
    resourceMetadataIds: freezeDeep((input.resourceMetadataIds ?? []).map((id) => sanitizeText(id, redactions, 180))),
    packageMetadataIds: freezeDeep((input.packageMetadataIds ?? []).map((id) => sanitizeText(id, redactions, 180))),
    includedFactsSummary: freezeDeep([
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
    excludedFactsSummary: freezeDeep([
      "raw-transcript-content",
      "raw-provider-output",
      "unsafe-file-contents",
      "unredacted-command-output",
      "raw-edit-content",
    ]),
    missingFacts: freezeDeep(Array.from(new Set(missingFacts.map((fact) => sanitizeText(fact, redactions, 160))))),
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
  return freezeDeep(Array.from(new Set(values.map((value) => sanitizeText(value, redactions, 120)))).sort());
}

function sanitizeId(value: string, redactions: Set<string>): string {
  return sanitizeText(value, redactions, 180)
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function sanitizeText(value: string, redactions: Set<string>, maxLength: number): string {
  return redactReportText(value, maxLength, { redactions, ellipsis: true });
}
