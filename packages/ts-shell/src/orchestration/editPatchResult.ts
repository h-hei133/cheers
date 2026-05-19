import { projectToolResult } from "../core/tools/toolResultProjection.js";
import {
  buildCompletedToolResult,
  buildPolicyBlockedResult,
  type ToolPolicyResultReceipt,
} from "../core/tools/toolPolicyResult.js";
import type { EditPatchMutationManifest } from "./editPatchManifest.js";
import type { EditPatchPreconditionProjection } from "./editPatchPreconditions.js";
import type { EditPatchPreviewEvidence } from "./editPatchPreview.js";

export interface EditPatchResultProjection {
  readonly moduleStatus:
    | "current-route-delegated"
    | "preview-only-stopped"
    | "unsupported-stopped";
  readonly receipt: ToolPolicyResultReceipt;
  readonly resultSummary: string;
  readonly terminalSummary: string;
  readonly transcriptSummary: string;
  readonly continueSummary: string;
  readonly evidence: readonly string[];
  readonly changedFiles: readonly [];
  readonly writerInvoked: false;
}

export function projectEditPatchResult(input: {
  readonly manifest: EditPatchMutationManifest;
  readonly preconditions: EditPatchPreconditionProjection;
  readonly preview: EditPatchPreviewEvidence;
}): EditPatchResultProjection {
  const current = input.manifest.supportStatus === "current-supported";
  const receipt = current
    ? buildCompletedToolResult({
        capability: "edit",
        label: "edit/patch module",
        reasonCode: input.manifest.reasonCode,
        reason: "Current bounded edit/write route remains delegated.",
        doNext: input.manifest.doNext,
        evidence: evidence(input),
      })
    : buildPolicyBlockedResult({
        capability: "edit",
        label: "edit/patch module",
        reasonCode: reasonCode(input),
        reason: reason(input),
        doNext: input.manifest.doNext,
        evidence: evidence(input),
      });
  const projection = projectToolResult(receipt);

  return {
    moduleStatus: current
      ? "current-route-delegated"
      : input.manifest.supportStatus === "future-only"
        ? "preview-only-stopped"
        : "unsupported-stopped",
    receipt,
    resultSummary: projection.resultSummary,
    terminalSummary: projection.terminalSummary,
    transcriptSummary: projection.transcriptSummary,
    continueSummary: projection.transcriptSummary,
    evidence: projection.evidenceSummary,
    changedFiles: [],
    writerInvoked: false,
  };
}

function reasonCode(input: {
  readonly manifest: EditPatchMutationManifest;
  readonly preconditions: EditPatchPreconditionProjection;
}): string {
  const firstMissing = input.preconditions.missing[0];
  if (firstMissing) {
    return `edit-patch-${firstMissing}-missing`;
  }
  return input.manifest.reasonCode;
}

function reason(input: {
  readonly manifest: EditPatchMutationManifest;
  readonly preconditions: EditPatchPreconditionProjection;
}): string {
  if (input.manifest.supportStatus === "future-only") {
    return "Edit/Patch module produced a preview-only future edit plan; execution is not enabled.";
  }
  return "Edit/Patch module stopped before mutation.";
}

function evidence(input: {
  readonly manifest: EditPatchMutationManifest;
  readonly preconditions: EditPatchPreconditionProjection;
  readonly preview: EditPatchPreviewEvidence;
}): readonly string[] {
  return [
    input.preview.evidenceId,
    `edit-patch-mode:${input.manifest.requestedMode}`,
    `edit-patch-preconditions:${input.preconditions.overall}`,
    "mutation:not-run-in-module",
    `authorization:${input.manifest.authorization}`,
    input.manifest.redaction,
  ];
}
