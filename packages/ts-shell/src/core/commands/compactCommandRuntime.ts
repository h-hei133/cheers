import { parseCompactSyntax } from "../../context/compact/command/syntax.js";
import {
  CompactCommandContractError,
  parseCompactCommandArgs,
} from "../../context/compact/command/compactCommandContract.js";
import { formatCompactCheckpointStatus } from "../../context/compact/checkpoint/compactCheckpointSurface.js";
import {
  DEFAULT_COMPACT_LIVE_CHECKPOINT_STORE,
  getLatestCompactCheckpoint,
} from "../../context/compact/checkpoint/compactLiveCheckpoint.js";
import { DEFAULT_COMPACT_INJECTION_STATE_STORE } from "../../context/compact/injection/compactInjectionState.js";
import { runCompactCommand } from "../../context/compact/command/compactCommandRunner.js";
import { formatCompactSessionSurface } from "../../context/compact/delivery/compactSessionSurface.js";
import { readProjectMemoryHealth } from "../../memory/store/health.js";
import { emitCommandResultToSidebar } from "./sidebarCommandEvents.js";
import type { CommandContext, LocalCommandResult } from "./types.js";

export async function runCompactLocalCommand(
  args: string[],
  context: CommandContext,
): Promise<LocalCommandResult> {
  try {
    const request = parseCompactCommandArgs(args, {
      projectInfo: {
        projectRoot: context.cwd,
        safeToPersistProjectRoot: true,
      },
      taskGoal: {
        nextAction: "Use the compact handoff to continue the session explicitly.",
      },
    });
    const parsed = parseCompactSyntax(args);
    const customInstructions = parsed.ok ? parsed.args.join(" ").trim() : "";
    const result = runCompactCommand(request);
    // The handoff forms write an artifact; they do not condense anything. They
    // used to create a live checkpoint and stage it for injection as well, so
    // `/compact --preview` — a read-only form the help advertises — changed what
    // the next turn received. Producing a checkpoint is now what a real
    // condensation does, and this command never condenses.
    //
    // The checkpoint surface is still printed when one exists, so the report
    // describes the compactions that actually happened rather than implying this
    // preview made one.
    const sessionScopeId = compactSessionScopeId(context);
    const checkpointStore = context.compactCheckpointStore ?? DEFAULT_COMPACT_LIVE_CHECKPOINT_STORE;
    const existingCheckpoint = getLatestCompactCheckpoint(
      checkpointStore,
      sessionScopeId,
    );
    const existingInjection = (
      context.compactInjectionStateStore ?? DEFAULT_COMPACT_INJECTION_STATE_STORE
    ).get(sessionScopeId);
    const outputLines: string[] = [
      formatCompactSessionSurface(result, await readProjectMemoryHealth(context.projectMemoryStore)),
      ...(existingCheckpoint || checkpointStore.retention().incomplete || existingInjection.incomplete
        ? [formatCompactCheckpointStatus(existingCheckpoint, existingInjection, checkpointStore.retention())]
        : []),
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
