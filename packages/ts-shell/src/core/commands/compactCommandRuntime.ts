import {
  CompactCommandContractError,
  parseCompactCommandArgs,
} from "../context/compactCommandContract.js";
import { formatCompactCheckpointStatus } from "../context/compactCheckpointSurface.js";
import {
  DEFAULT_COMPACT_LIVE_CHECKPOINT_STORE,
  updateLatestCompactCheckpoint,
} from "../context/compactLiveCheckpoint.js";
import { runCompactCommand } from "../context/compactCommandRunner.js";
import { formatCompactSessionSurface } from "../context/compactSessionSurface.js";
import type { CommandContext, LocalCommandResult } from "./types.js";

export async function runCompactLocalCommand(
  args: string[],
  context: CommandContext,
): Promise<LocalCommandResult> {
  try {
    const request = parseCompactCommandArgs(args, {
      source: "session",
      projectInfo: {
        projectRoot: context.cwd,
        safeToPersistProjectRoot: true,
      },
      taskGoal: {
        nextAction: "Use the compact handoff to continue the session explicitly.",
      },
    });
    const result = runCompactCommand(request);
    const checkpoint = updateLatestCompactCheckpoint(
      context.compactCheckpointStore ?? DEFAULT_COMPACT_LIVE_CHECKPOINT_STORE,
      {
        sessionScopeId: compactSessionScopeId(context),
        sourceCommand: compactSourceCommand(context.rawCommandName),
        result,
      },
    );
    return {
      kind: "local",
      output:
        result.request.mode === "json" && result.json
          ? result.json
          : [
              formatCompactSessionSurface(result),
              formatCompactCheckpointStatus(checkpoint),
            ].join("\n\n"),
    };
  } catch (error) {
    return {
      kind: "local",
      output: formatCompactCommandError(error),
    };
  }
}

function compactSessionScopeId(context: CommandContext): string {
  return context.sessionId ? `session:${context.sessionId}` : `cwd:${context.cwd}`;
}

function compactSourceCommand(
  rawCommandName: string | undefined,
): "/compact" | "/handoff" {
  return rawCommandName === "handoff" ? "/handoff" : "/compact";
}

function formatCompactCommandError(error: unknown): string {
  const reason =
    error instanceof Error ? error.message : "Unknown compact command error.";
  const blocker =
    error instanceof CompactCommandContractError
      ? error.code
      : "compact-command-error";
  return [
    "Compact v2 handoff",
    "Result",
    "- Outcome: blocked",
    `- BlockerKind: ${blocker}`,
    `- Reason: ${reason}`,
    "- DoNext: Retry with /compact, /compact preview, /compact render, or /compact json. Do not pass execute, persist, memory, or raw-content flags.",
  ].join("\n");
}
