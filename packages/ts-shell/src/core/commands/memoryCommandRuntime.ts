import { memorySyntax } from "../../memory/commands/syntax.js";
import { parseSyntax } from "./syntax/parse.js";
import { syntaxHelp } from "./syntax/projection.js";
import {
  getLatestCompactCheckpoint,
  DEFAULT_COMPACT_LIVE_CHECKPOINT_STORE,
} from "../../context/compact/checkpoint/compactLiveCheckpoint.js";
import { extractProjectMemoryCandidates } from "../../memory/projectMemoryCandidateExtractor.js";
import {
  parseProjectMemoryReviewCommandArgs,
  ProjectMemoryReviewCommandContractError,
} from "../../memory/projectMemoryReviewCommandContract.js";
import { runProjectMemoryReviewCommand } from "../../memory/projectMemoryReviewCommandRunner.js";
import { readProjectMemoryHealth } from "../../memory/store/health.js";
import {
  parseProjectMemoryRecallCommandArgs,
  ProjectMemoryRecallCommandContractError,
} from "../../memory/projectMemoryRecallCommandContract.js";
import { runProjectMemoryRecallCommand } from "../../memory/projectMemoryRecallCommandRunner.js";
import {
  parseProjectMemoryDeleteCommandArgs,
  ProjectMemoryDeleteCommandContractError,
} from "../../memory/projectMemoryDeleteCommandContract.js";
import { runProjectMemoryDeleteCommand } from "../../memory/projectMemoryDeleteCommandRunner.js";
import {
  parseProjectMemoryUseCommandArgs,
  ProjectMemoryUseCommandContractError,
} from "../../memory/projectMemoryUseCommandContract.js";
import { runProjectMemoryUseCommand } from "../../memory/projectMemoryUseCommandRunner.js";
import {
  parseProjectMemorySaveCommandArgs,
  ProjectMemorySaveCommandContractError,
} from "../../memory/projectMemorySaveCommandContract.js";
import { runProjectMemorySaveCommand } from "../../memory/projectMemorySaveCommandRunner.js";
import {
  DEFAULT_PROJECT_MEMORY_REVIEW_STATE_STORE,
} from "../../memory/projectMemoryReviewState.js";
import { emitCommandResultToSidebar } from "./sidebarCommandEvents.js";
import type { CommandContext, LocalCommandResult } from "./types.js";
import {
  executeMemoryInspect,
  executeMemoryRetain,
  executeMemoryRecall,
} from "../memory/memoryTools.js";
import type { MemoryCategory } from "../memory/types.js";

/**
 * /memory command
 * Unified memory engine:
 * 1. Coordinates ProjectMemoryReview lifecycle (review, save, recall, wake, use, invalidate, delete).
 * 2. Emits real-time telemetry to sidebar.
 * 3. Supports retained fact inspection and explicit retention.
 */
export async function runMemoryCommand(
  args: string[],
  context: CommandContext,
): Promise<LocalCommandResult> {
  const rawCmd = (context.rawCommandName ?? "").replace(/^\//, "").toLowerCase();
  const sub = args[0]?.toLowerCase();

  // Named invocations retain their independent free-text payload.
  if (rawCmd === "recall") {
    const query = args.join(" ").trim();
    if (!query) {
      return { kind: "local", output: "Usage: `/recall <query>`\nExample: `/recall NormProof rules`" };
    }
    const output = await executeMemoryRecall({ query });
    return { kind: "local", output };
  }

  if (rawCmd === "retain") {
    const statement = args.join(" ").trim();
    if (!statement) {
      return { kind: "local", output: "Usage: `/retain <statement>`\nExample: `/retain Project uses Vitest`" };
    }
    const output = await executeMemoryRetain({
      items: [{ statement }],
    });
    return { kind: "local", output };
  }

  const parsed = parseSyntax(memorySyntax, args);
  if (!parsed.ok) return { kind: "local", output: formatMemoryReviewCommandError(new ProjectMemoryReviewCommandContractError("memory-command-invalid-arguments", parsed.reason)) };

  // Retained fact storage inspection.
  if (sub === "inspect" || sub === "stats") {
    const statsOutput = await executeMemoryInspect();
    const localResult: LocalCommandResult = {
      kind: "local",
      output: statsOutput,
    };
    emitCommandResultToSidebar(context, {
      command: "/memory",
      args,
      result: localResult,
    });
    return localResult;
  }

  // Explicit fact retention.
  if (sub === "add" || sub === "retain") {
    const statement = args.slice(1).join(" ").trim();
    if (!statement) {
      return {
        kind: "local",
        output: "Usage: `/memory add <statement>`\nExample: `/memory add Project uses Vitest`",
      };
    }
    let category: MemoryCategory = "convention";
    if (statement.toLowerCase().includes("rule") || statement.toLowerCase().includes("must")) {
      category = "constraint";
    } else if (statement.toLowerCase().includes("arch") || statement.toLowerCase().includes("layer")) {
      category = "architecture";
    }
    const output = await executeMemoryRetain({
      items: [{ statement, category }],
    });
    const localResult: LocalCommandResult = {
      kind: "local",
      output,
    };
    emitCommandResultToSidebar(context, {
      command: "/memory",
      args,
      result: localResult,
    });
    return localResult;
  }

  // Standard Lifecycle & Review Protocol
  return runMemoryLocalCommand(args, context);
}

export async function runMemoryLocalCommand(
  args: string[],
  context: CommandContext,
): Promise<LocalCommandResult> {
  try {
    const parsed = parseSyntax(memorySyntax, args);
    if (!parsed.ok) throw new ProjectMemoryReviewCommandContractError("memory-command-invalid-arguments", parsed.reason);
    args = args.length ? [args[0]!.toLowerCase(), ...args.slice(1)] : [];
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
      health: await readProjectMemoryHealth(context.projectMemoryStore),
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
    "- DoNext: Inspect /memory and retry with a supported action.",
    syntaxHelp(memorySyntax),
  ].join("\n");
}
