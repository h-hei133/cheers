import type { CodingResultSummary } from "../../orchestration/types.js";
import type { QueryCompletionTranscriptEvent } from "../../result/terminal/truth.js";
import { compactContinuityText } from "../sessionContinuityModule.js";
import type { TranscriptEvent } from "../sessionEventCodec.js";

export function projectSessionUnresolvedItems(input: {
  readonly sessionLastError?: string;
  readonly lastRunErrorEvent?: Extract<TranscriptEvent, { type: "lifecycle" }>;
  readonly continuityTerminalSource?: QueryCompletionTranscriptEvent;
  readonly lastCodingResult?: CodingResultSummary;
}): {
  readonly lastFailure?: string;
  readonly unresolvedItems: readonly string[];
} {
  const unresolvedItems: string[] = [];
  const lastFailure =
    input.sessionLastError?.trim() ||
    input.lastRunErrorEvent?.detail?.trim() ||
    input.continuityTerminalSource?.event.result.stopReason?.trim();
  if (lastFailure) {
    unresolvedItems.push(`last-error:${lastFailure}`);
  }
  if (
    input.continuityTerminalSource?.event.result.terminalClassification &&
    input.continuityTerminalSource.event.result.terminalClassification !==
      "success"
  ) {
    unresolvedItems.push(
      `terminal:${input.continuityTerminalSource.event.result.terminalClassification} (${input.continuityTerminalSource.event.result.terminalReason})`,
    );
    if (input.continuityTerminalSource.event.result.stopReason?.trim()) {
      unresolvedItems.push(
        `stop-reason:${compactContinuityText(
          input.continuityTerminalSource.event.result.stopReason,
          180,
        )}`,
      );
    }
  } else if (input.lastRunErrorEvent?.detail?.trim()) {
    unresolvedItems.push(
      `previous-run-error:${compactContinuityText(
        input.lastRunErrorEvent.detail,
        180,
      )}`,
    );
  }
  if ((input.lastCodingResult?.failedFiles.length ?? 0) > 0) {
    unresolvedItems.push(
      `failed-files:${input.lastCodingResult?.failedFiles
        .slice(0, 4)
        .map((entry) => `${entry.path} (${entry.reason})`)
        .join(", ")}`,
    );
  }
  if (
    input.lastCodingResult?.taskSatisfaction.verdict &&
    input.lastCodingResult.taskSatisfaction.verdict !== "satisfied"
  ) {
    unresolvedItems.push(
      `task-satisfaction:${input.lastCodingResult.taskSatisfaction.verdict}`,
    );
  }
  if (
    input.lastCodingResult?.verification.status &&
    input.lastCodingResult.verification.status !== "passed"
  ) {
    unresolvedItems.push(`verify:${input.lastCodingResult.verification.status}`);
  }
  if (
    input.lastCodingResult?.repair.status &&
    input.lastCodingResult.repair.status === "failed"
  ) {
    unresolvedItems.push("repair:failed");
  }
  if (
    input.lastCodingResult?.continuation.status &&
    input.lastCodingResult.continuation.status ===
      "failed-after-bounded-continuation"
  ) {
    unresolvedItems.push("continuation:failed-after-bounded-continuation");
  }
  return { lastFailure, unresolvedItems };
}
