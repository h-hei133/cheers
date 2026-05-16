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
  parseProjectMemoryRecallCommandArgs,
  ProjectMemoryRecallCommandContractError,
} from "../context/projectMemoryRecallCommandContract.js";
import { runProjectMemoryRecallCommand } from "../context/projectMemoryRecallCommandRunner.js";
import {
  parseProjectMemoryDeleteCommandArgs,
  ProjectMemoryDeleteCommandContractError,
} from "../context/projectMemoryDeleteCommandContract.js";
import { runProjectMemoryDeleteCommand } from "../context/projectMemoryDeleteCommandRunner.js";
import {
  parseProjectMemoryUseCommandArgs,
  ProjectMemoryUseCommandContractError,
} from "../context/projectMemoryUseCommandContract.js";
import { runProjectMemoryUseCommand } from "../context/projectMemoryUseCommandRunner.js";
import {
  parseProjectMemorySaveCommandArgs,
  ProjectMemorySaveCommandContractError,
} from "../context/projectMemorySaveCommandContract.js";
import { runProjectMemorySaveCommand } from "../context/projectMemorySaveCommandRunner.js";
import {
  DEFAULT_PROJECT_MEMORY_REVIEW_STATE_STORE,
} from "../context/projectMemoryReviewState.js";
import { emitCommandResultToSidebar } from "./sidebarCommandEvents.js";
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
    if (args[0] === "recall" || args[0] === "search" || args[0] === "wake") {
      const request = parseProjectMemoryRecallCommandArgs(args);
      const result = await runProjectMemoryRecallCommand({
        request,
        memoryStore: context.projectMemoryStore,
      });
      const localResult: LocalCommandResult = {
        kind: "local",
        output: result.output,
      };
      emitCommandResultToSidebar(context, {
        command: "/memory",
        args,
        result: localResult,
      });
      return localResult;
    }
    if (args[0] === "use") {
      const request = parseProjectMemoryUseCommandArgs(args);
      const result = await runProjectMemoryUseCommand({
        request,
        sessionScopeId: reviewSessionId,
        memoryStore: context.projectMemoryStore,
        injectionStateStore: context.projectMemoryInjectionStateStore,
      });
      const localResult: LocalCommandResult = {
        kind: "local",
        output: result.output,
      };
      emitCommandResultToSidebar(context, {
        command: "/memory",
        args,
        result: localResult,
      });
      return localResult;
    }
    if (args[0] === "invalidate" || args[0] === "delete") {
      const request = parseProjectMemoryDeleteCommandArgs(args);
      const result = await runProjectMemoryDeleteCommand({
        request,
        memoryStore: context.projectMemoryStore,
      });
      const localResult: LocalCommandResult = {
        kind: "local",
        output: result.output,
      };
      emitCommandResultToSidebar(context, {
        command: "/memory",
        args,
        result: localResult,
      });
      return localResult;
    }
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
      const localResult: LocalCommandResult = {
        kind: "local",
        output: result.output,
      };
      emitCommandResultToSidebar(context, {
        command: "/memory",
        args,
        result: localResult,
      });
      return localResult;
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
    const localResult: LocalCommandResult = {
      kind: "local",
      output: result.output,
    };
    emitCommandResultToSidebar(context, {
      command: "/memory",
      args,
      result: localResult,
    });
    return localResult;
  } catch (error) {
    const localResult: LocalCommandResult = {
      kind: "local",
      output: formatMemoryReviewCommandError(error),
    };
    emitCommandResultToSidebar(context, {
      command: "/memory",
      args,
      result: localResult,
    });
    return localResult;
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
      : error instanceof ProjectMemoryRecallCommandContractError
      ? error.code
      : error instanceof ProjectMemoryDeleteCommandContractError
        ? error.code
      : error instanceof ProjectMemoryUseCommandContractError
        ? error.code
      : error instanceof ProjectMemorySaveCommandContractError
        ? error.code
      : "memory-review-command-error";
  return [
    error instanceof ProjectMemoryRecallCommandContractError
      ? "Project memory recall"
      : error instanceof ProjectMemoryDeleteCommandContractError
      ? "Project memory lifecycle"
      : error instanceof ProjectMemoryUseCommandContractError
      ? "Project memory use"
      : error instanceof ProjectMemorySaveCommandContractError
      ? "Project memory store"
      : "Project memory review",
    "Result",
    "- Outcome: blocked",
    `- BlockerKind: ${blocker}`,
    `- Reason: ${reason}`,
    "- Memory written: no",
    "- Auto-load: no",
    "- Auto-injected: no",
    "- DoNext: Retry with /memory, /memory approve <candidate-id>, /memory reject <candidate-id>, /memory save <candidate-id>, /memory recall <query>, /memory wake, /memory use, /memory use <query>, /memory invalidate <record-id>, /memory delete <record-id>, or /memory status.",
  ].join("\n");
}
