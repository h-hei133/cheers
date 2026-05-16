import {
  getLatestCompactCheckpoint,
  DEFAULT_COMPACT_LIVE_CHECKPOINT_STORE,
} from "../context/compactLiveCheckpoint.js";
import { extractProjectMemoryCandidates } from "../context/projectMemoryCandidateExtractor.js";
import {
  parseProjectMemoryReviewCommandArgs,
  ProjectMemoryReviewCommandContractError,
} from "../context/projectMemoryReviewCommandContract.js";
import { runProjectMemoryReviewCommand } from "../context/projectMemoryReviewCommandRunner.js";
import {
  parseProjectMemorySaveCommandArgs,
  ProjectMemorySaveCommandContractError,
} from "../context/projectMemorySaveCommandContract.js";
import { runProjectMemorySaveCommand } from "../context/projectMemorySaveCommandRunner.js";
import {
  DEFAULT_PROJECT_MEMORY_REVIEW_STATE_STORE,
} from "../context/projectMemoryReviewState.js";
import type { CommandContext, LocalCommandResult } from "./types.js";

export async function runMemoryLocalCommand(
  args: string[],
  context: CommandContext,
): Promise<LocalCommandResult> {
  try {
    const reviewSessionId = memoryReviewSessionScopeId(context);
    const compactStore =
      context.compactCheckpointStore ?? DEFAULT_COMPACT_LIVE_CHECKPOINT_STORE;
    const latest = getLatestCompactCheckpoint(compactStore, reviewSessionId);
    const candidates = latest
      ? extractProjectMemoryCandidates({ compactPacket: latest.packet })
      : [];
    if (args[0] === "save" || args[0] === "status") {
      const request = parseProjectMemorySaveCommandArgs(args);
      const result = await runProjectMemorySaveCommand({
        request,
        reviewSessionId,
        candidates,
        reviewStore:
          context.projectMemoryReviewStateStore ??
          DEFAULT_PROJECT_MEMORY_REVIEW_STATE_STORE,
        memoryStore: context.projectMemoryStore,
      });
      return {
        kind: "local",
        output: result.output,
      };
    }
    const request = parseProjectMemoryReviewCommandArgs(args);
    const result = runProjectMemoryReviewCommand({
      request,
      reviewSessionId,
      candidates,
      store:
        context.projectMemoryReviewStateStore ??
        DEFAULT_PROJECT_MEMORY_REVIEW_STATE_STORE,
      sourceCommand: "/memory",
    });
    return {
      kind: "local",
      output: result.output,
    };
  } catch (error) {
    return {
      kind: "local",
      output: formatMemoryReviewCommandError(error),
    };
  }
}

function memoryReviewSessionScopeId(context: CommandContext): string {
  return context.sessionId ? `session:${context.sessionId}` : `cwd:${context.cwd}`;
}

function formatMemoryReviewCommandError(error: unknown): string {
  const reason =
    error instanceof Error ? error.message : "Unknown memory review command error.";
  const blocker =
    error instanceof ProjectMemoryReviewCommandContractError
      ? error.code
      : error instanceof ProjectMemorySaveCommandContractError
        ? error.code
      : "memory-review-command-error";
  return [
    error instanceof ProjectMemorySaveCommandContractError
      ? "Project memory store"
      : "Project memory review",
    "Result",
    "- Outcome: blocked",
    `- BlockerKind: ${blocker}`,
    `- Reason: ${reason}`,
    "- Memory written: no",
    "- Auto-load: no",
    "- Retrieval / wake-up / recall: not enabled",
    "- DoNext: Retry with /memory, /memory approve <candidate-id>, /memory reject <candidate-id>, /memory save <candidate-id>, or /memory status.",
  ].join("\n");
}
