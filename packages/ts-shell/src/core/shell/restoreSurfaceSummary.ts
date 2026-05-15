import type { CodingResultSummary } from "../../orchestration/types.js";

export function formatExplicitRestoreSummaryLines(
  codingResult: CodingResultSummary | undefined,
): string[] {
  if (!codingResult || codingResult.failedFiles.length === 0) {
    return [];
  }

  const surface = codingResult.recoverySurface;
  if (!surface?.explicitRestoreAvailable) {
    return [];
  }

  const files =
    surface.restorableFiles.length > 0
      ? surface.restorableFiles.join(", ")
      : "captured authority records";
  const lines = [
    "- Restore preview: available through explicit guarded restore; no automatic recovery ran.",
    `- Restore candidates: ${files}`,
  ];
  if (surface.recoveryAuthorityId) {
    lines.push(`- Restore authority: ${surface.recoveryAuthorityId}`);
  }
  lines.push("- Restore execution: explicit only; atomic rollback is unavailable.");
  return lines;
}
