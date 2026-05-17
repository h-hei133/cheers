import type { LocalCommandResult } from "../commands/types.js";
import type {
  SidebarEventKind,
  SidebarEventSeverity,
  SidebarEventSource,
} from "./sidebarEventModel.js";
import {
  NOOP_SIDEBAR_EVENT_SINK,
  type SidebarEventSink,
  type SidebarEventSinkEmitInput,
} from "./sidebarEventSink.js";
import { SidebarEventSafetyError } from "./sidebarLiveEventStore.js";

export interface SidebarCommandEventAdapterInput {
  readonly command: string;
  readonly args?: readonly string[];
  readonly result: LocalCommandResult;
  readonly timestamp?: string;
}

export function adaptCommandResultToSidebarEvent(
  input: SidebarCommandEventAdapterInput,
): SidebarEventSinkEmitInput {
  const command = normalizeCommand(input.command);
  const family = commandFamily(command);
  const outcome = extractOutcome(input.result.output);
  const subcommand = input.args?.[0]?.toLowerCase();
  return {
    kind: kindForFamily(family, subcommand),
    severity: severityForOutcome(outcome, input.result.output),
    source: sourceForFamily(family),
    title: titleForCommand(family, command, subcommand),
    summary: summarizeCommandOutput(outcome, input.result.output),
    timestamp: input.timestamp,
    rawContent: input.result.output,
    references: [command, ...(subcommand ? [`${command} ${subcommand}`] : [])],
    evidence: [
      "sidebar-command-event-adapter:local-result-summary",
      "sidebar-command-event-adapter:no-raw-output",
    ],
  };
}

export function emitSidebarCommandResult(
  sink: SidebarEventSink | undefined,
  input: SidebarCommandEventAdapterInput,
): void {
  const target = sink ?? NOOP_SIDEBAR_EVENT_SINK;
  const event = adaptCommandResultToSidebarEvent(input);
  try {
    if (event.severity === "blocked") {
      target.emitBlocker(event);
      return;
    }
    if (event.severity === "warning" || event.severity === "error") {
      target.emitWarning(event);
      return;
    }
    target.emitUserVisible(event);
  } catch (error) {
    if (error instanceof SidebarEventSafetyError) {
      throw error;
    }
  }
}

function normalizeCommand(command: string): string {
  return command.startsWith("/") ? command : `/${command}`;
}

function commandFamily(command: string): "browser" | "compact" | "memory" | "warmup" | "sidebar" | "restore" | "command" {
  if (command === "/browser") {
    return "browser";
  }
  if (command === "/compact" || command === "/handoff") {
    return "compact";
  }
  if (command === "/memory") {
    return "memory";
  }
  if (command === "/warmup") {
    return "warmup";
  }
  if (command === "/sidebar") {
    return "sidebar";
  }
  if (command === "/restore") {
    return "restore";
  }
  return "command";
}

function kindForFamily(
  family: ReturnType<typeof commandFamily>,
  subcommand?: string,
): SidebarEventKind {
  if (family === "memory") {
    return "memory";
  }
  if (family === "compact") {
    return "compact";
  }
  if (family === "warmup") {
    return "warmup";
  }
  if (family === "browser") {
    return "tool";
  }
  if (family === "restore") {
    return subcommand === "execute" ? "warning" : "command";
  }
  return "command";
}

function sourceForFamily(family: ReturnType<typeof commandFamily>): SidebarEventSource {
  if (family === "compact") {
    return "compact";
  }
  if (family === "memory") {
    return "memory";
  }
  if (family === "warmup") {
    return "warmup";
  }
  if (family === "browser") {
    return "tool-availability";
  }
  return "slash-command";
}

function titleForCommand(
  family: ReturnType<typeof commandFamily>,
  command: string,
  subcommand?: string,
): string {
  if (family === "compact") {
    return "Compact checkpoint";
  }
  if (family === "memory") {
    if (subcommand === "save") {
      return "Memory saved";
    }
    if (subcommand === "recall" || subcommand === "search" || subcommand === "wake") {
      return "Memory recalled";
    }
    if (subcommand === "use") {
      return "Memory use staged";
    }
    if (subcommand === "invalidate" || subcommand === "delete") {
      return "Memory lifecycle";
    }
    return "Memory reviewed";
  }
  if (family === "warmup") {
    return subcommand === "rebuild" ? "Warmup rebuilt" : "Warmup status";
  }
  if (family === "browser") {
    if (subcommand === "preview") {
      return "Browser preview";
    }
    if (subcommand === "dry-run") {
      return "Browser dry-run";
    }
    if (subcommand === "execute") {
      return "Browser execution";
    }
    return "Browser status";
  }
  if (family === "sidebar") {
    return "Sidebar rendered";
  }
  return command;
}

function extractOutcome(output: string): string {
  const outcome = output.match(/^- Outcome:\s*(.+)$/im)?.[1]?.trim();
  if (outcome) {
    return outcome;
  }
  if (/blocked/i.test(output)) {
    return "blocked";
  }
  if (/error|failed/i.test(output)) {
    return "error";
  }
  return "success";
}

function severityForOutcome(
  outcome: string,
  output: string,
): SidebarEventSeverity {
  if (/blocked/i.test(outcome)) {
    return "blocked";
  }
  if (/invalid|stale/i.test(outcome)) {
    return "warning";
  }
  if (/error|failed/i.test(outcome)) {
    return "error";
  }
  if (/warning|stale|invalid/i.test(output)) {
    return "warning";
  }
  if (/success|saved|rebuilt|staged|created|deleted|invalidated|yes/i.test(outcome)) {
    return "success";
  }
  return "info";
}

function summarizeCommandOutput(outcome: string, output: string): string {
  const details = output
    .split("\n")
    .map((line) => line.trim())
    .filter(isSafeSummaryLine)
    .slice(0, 5)
    .join("; ");
  return `${outcome}: ${details || "completed; raw output excluded"}`;
}

function isSafeSummaryLine(line: string): boolean {
  return /^- (Outcome|BlockerKind|Memory written|Auto-load|Auto-injected|Injected into model|Startup auto-load|Provider\/model call|Persistence|Recovery execution|Future-turn injection|Injection status|Checkpoint id|Result count|Cache status|Staleness|Browser capability|Action|Requested action|Target|Risk|Readiness|Recommended future runtime|Sandbox decision|Blocked risks|Preflight status|Sandbox authority|Network allowlist|Confirmation status|Evidence requirements|Blockers\/warnings|Executed|Browser process|MCP discovery\/launch|Network access|DoNext|Next action):/i.test(line);
}
