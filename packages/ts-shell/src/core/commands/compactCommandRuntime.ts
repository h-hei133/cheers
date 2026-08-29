import {
  CompactCommandContractError,
  parseCompactCommandArgs,
} from "../context/compact/command/compactCommandContract.js";
import { formatCompactCheckpointStatus } from "../context/compact/checkpoint/compactCheckpointSurface.js";
import {
  DEFAULT_COMPACT_LIVE_CHECKPOINT_STORE,
  updateLatestCompactCheckpoint,
} from "../context/compact/checkpoint/compactLiveCheckpoint.js";
import {
  DEFAULT_COMPACT_INJECTION_STATE_STORE,
  markCompactCheckpointPendingInjection,
} from "../context/compact/injection/compactInjectionState.js";
import { runCompactCommand } from "../context/compact/command/compactCommandRunner.js";
import { formatCompactSessionSurface } from "../context/compact/delivery/compactSessionSurface.js";
import { emitCommandResultToSidebar } from "./sidebarCommandEvents.js";
import type { CommandContext, LocalCommandResult } from "./types.js";

export async function runCompactLocalCommand(
  args: string[],
  context: CommandContext,
): Promise<LocalCommandResult> {
  try {
    const nonFlagArgs = args.filter((a) => !a.startsWith("--"));
    const firstArg = nonFlagArgs[0]?.toLowerCase();
    const instructionArgs = (firstArg === "preview" || firstArg === "render" || firstArg === "json")
      ? nonFlagArgs.slice(1)
      : nonFlagArgs;
    const customInstructions = instructionArgs.join(" ").trim();
    const request = parseCompactCommandArgs(args, {
      projectInfo: {
        projectRoot: context.cwd,
        safeToPersistProjectRoot: true,
      },
      taskGoal: {
        nextAction: "Use the compact handoff to continue the session explicitly.",
      },
    });
    const result = runCompactCommand(request);
    const sessionScopeId = compactSessionScopeId(context);
    const checkpoint = updateLatestCompactCheckpoint(
      context.compactCheckpointStore ?? DEFAULT_COMPACT_LIVE_CHECKPOINT_STORE,
      {
        sessionScopeId,
        sourceCommand: compactSourceCommand(context.rawCommandName),
        result,
      },
    );
    const injectionState = markCompactCheckpointPendingInjection(
      context.compactInjectionStateStore ??
        DEFAULT_COMPACT_INJECTION_STATE_STORE,
      {
        sessionScopeId,
        checkpointId: checkpoint.checkpointId,
        sourceCommand: checkpoint.sourceCommand,
        createdAt: checkpoint.createdAt,
      },
    );
    const outputLines: string[] = [
      formatCompactSessionSurface(result),
      formatCompactCheckpointStatus(checkpoint, injectionState),
    ];

    if (customInstructions) {
      outputLines.push("", `Custom instructions noted: "${customInstructions}"`);
    }

    const localResult: LocalCommandResult = {
      kind: "local",
      output:
        result.request.mode === "json" && result.json
          ? result.json
          : outputLines.join("\n"),
    };

    emitCommandResultToSidebar(context, {
      command: "compact",
      args,
      result: localResult,
    });
    return localResult;
  } catch (error) {
    const localResult: LocalCommandResult = {
      kind: "local",
      output: formatCompactCommandError(error),
    };
    emitCommandResultToSidebar(context, {
      command: compactSourceCommand(context.rawCommandName),
      args,
      result: localResult,
    });
    return localResult;
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
