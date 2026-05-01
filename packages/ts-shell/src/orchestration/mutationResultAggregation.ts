import {
  buildFileMutationSummaryContract,
  type FileMutationExecutionSummary,
} from "./mutationExecution.js";
import type { CodingPatchRecord } from "./types.js";

export interface MutationResultAggregate {
  readonly changedFiles: string[];
  readonly failedFiles: Array<{ path: string; reason: string }>;
  readonly patches: CodingPatchRecord[];
  readonly evidence: string[];
  readonly repairNotes: string[];
}

export function reconcileFileMutationSummary(
  summary: FileMutationExecutionSummary,
  aggregate: MutationResultAggregate,
): void {
  for (const changedFile of summary.changedFiles) {
    if (!aggregate.changedFiles.includes(changedFile)) {
      aggregate.changedFiles.push(changedFile);
    }
  }

  for (const failedFile of summary.failedFiles) {
    const alreadyRecorded = aggregate.failedFiles.some(
      (entry) =>
        normalizePathLike(entry.path) === normalizePathLike(failedFile.path) &&
        entry.reason === failedFile.reason,
    );
    if (!alreadyRecorded) {
      aggregate.failedFiles.push(failedFile);
    }
  }

  for (const patch of summary.patches) {
    if (!aggregate.patches.includes(patch)) {
      aggregate.patches.push(patch);
    }
  }

  const summaryContract = buildFileMutationSummaryContract(summary);

  for (const evidence of summaryContract.evidence) {
    if (!aggregate.evidence.includes(evidence)) {
      aggregate.evidence.push(evidence);
    }
  }

  for (const repairNote of summaryContract.repairNotes) {
    if (!aggregate.repairNotes.includes(repairNote)) {
      aggregate.repairNotes.push(repairNote);
    }
  }
}

function normalizePathLike(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.\/+/g, "").trim();
}
