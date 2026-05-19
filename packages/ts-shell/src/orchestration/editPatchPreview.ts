import type { EditPatchMutationManifest } from "./editPatchManifest.js";
import type { EditPatchPreconditionProjection } from "./editPatchPreconditions.js";

export interface EditPatchPreviewEvidence {
  readonly evidenceId: string;
  readonly targetSummary: string;
  readonly operationSummary: string;
  readonly plannedChanges: readonly string[];
  readonly missingInformation: readonly string[];
  readonly ambiguityFacts: readonly string[];
  readonly authorityFacts: readonly string[];
  readonly staleReadFacts: readonly string[];
  readonly verificationPlan: string;
  readonly rollbackSnapshotRequirement: string;
  readonly redaction: "raw-content-excluded";
}

export function buildEditPatchPreview(input: {
  readonly manifest: EditPatchMutationManifest;
  readonly preconditions?: EditPatchPreconditionProjection;
}): EditPatchPreviewEvidence {
  const targetSummary = summarizeTargets(input.manifest);
  const operationSummary = input.manifest.operations
    .map((operation) => operation.summary)
    .join("; ");
  const missingInformation =
    input.preconditions?.rows
      .filter((row) => row.status === "missing" || row.status === "required")
      .map((row) => `${row.key}: ${row.reason}`) ?? [];

  return {
    evidenceId: evidenceId(input.manifest),
    targetSummary: sanitizePreviewText(targetSummary),
    operationSummary: sanitizePreviewText(operationSummary || "no operation"),
    plannedChanges: input.manifest.operations.map((operation) =>
      sanitizePreviewText(operation.summary),
    ),
    missingInformation: missingInformation.map(sanitizePreviewText),
    ambiguityFacts:
      input.manifest.explicitTargets.length === 0
        ? ["target pending"]
        : ["single explicit target set represented"],
    authorityFacts: [
      `workspace-authority:${input.manifest.workspaceAuthorityRequirement}`,
    ],
    staleReadFacts: [`stale-read:${input.manifest.staleReadRequirement}`],
    verificationPlan: sanitizePreviewText(
      `verification:${input.manifest.verificationRequirement}`,
    ),
    rollbackSnapshotRequirement: sanitizePreviewText(
      `rollback-snapshot:${input.manifest.rollbackSnapshotRequirement}`,
    ),
    redaction: "raw-content-excluded",
  };
}

export function sanitizePreviewText(value: string, maxLength = 240): string {
  return value
    .replace(/<html[\s\S]*?<\/html>/gi, "[raw-content-excluded]")
    .replace(/\b(raw\s+dom|raw\s+html|document\.cookie|localStorage|sessionStorage)\b/gi, "[raw-content-excluded]")
    .replace(/\b(api[_-]?key|token|secret|cookie|authorization|password)\b\s*[:=]\s*\S+/gi, "$1=[redacted]")
    .replace(/\b(sk-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g, "[secret-redacted]")
    .replace(/\/home\/wang\/\.private-agents-real[^\s"'`]*/g, "[redacted-real-provider-home]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function summarizeTargets(manifest: EditPatchMutationManifest): string {
  if (manifest.explicitTargets.length > 0) {
    return `explicit:${manifest.explicitTargets.join(", ")}`;
  }
  if (manifest.candidateTargets.length > 0) {
    return `candidates:${manifest.candidateTargets.join(", ")}`;
  }
  return "targets:pending";
}

function evidenceId(manifest: EditPatchMutationManifest): string {
  return sanitizePreviewText(
    `edit-patch-preview:${manifest.requestedMode}:${manifest.reasonCode}`,
    120,
  )
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/g, "-");
}
