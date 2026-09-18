import { createSidebarEvent, type SidebarEvent } from "./sidebarEventModel.js";
import type { SidebarAvailabilityStatus } from "./sidebarToolAvailability.js";

export interface SidebarEventBridgeInput {
  readonly maxEvents?: number;
  readonly events?: readonly SidebarEvent[];
  readonly commandResults?: readonly {
    readonly command: string;
    readonly outcome: "status" | "success" | "blocked" | "error";
    readonly summary: string;
    readonly timestamp?: string;
    readonly rawOutput?: string;
  }[];
  readonly compact?: {
    readonly checkpointId?: string;
    readonly checkpointStatus?: string;
    readonly injectionStatus?: string;
    readonly timestamp?: string;
  };
  readonly memory?: readonly {
    readonly action: "review" | "save" | "recall" | "use" | "invalidate" | "delete";
    readonly status: string;
    readonly recordCount?: number;
    readonly query?: string;
    readonly timestamp?: string;
    readonly rawMemoryText?: string;
  }[];
  readonly warmup?: {
    readonly outcome: "status" | "rebuilt" | "blocked";
    readonly staleness?: string;
    readonly found?: boolean;
    readonly timestamp?: string;
  };
  readonly validation?: readonly {
    readonly command: string;
    readonly status: string;
    readonly timestamp?: string;
    readonly fullOutput?: string;
  }[];
  readonly edit?: {
    readonly changedFileCount?: number;
    readonly failedFileCount?: number;
    readonly timestamp?: string;
    readonly rawOriginalContent?: string;
  };
  readonly tools?: readonly {
    readonly label: string;
    readonly status: SidebarAvailabilityStatus;
    readonly timestamp?: string;
  }[];
  readonly route?: {
    readonly routeId?: string;
    readonly status: string;
    readonly nextAction?: string;
    readonly timestamp?: string;
  };
  readonly warnings?: readonly { readonly id: string; readonly message: string; readonly timestamp?: string }[];
  readonly blockers?: readonly { readonly id: string; readonly message: string; readonly timestamp?: string }[];
}

export interface SidebarEventBridgeResult {
  readonly events: readonly SidebarEvent[];
  readonly droppedEventCount: number;
  readonly providerCall: "none";
  readonly modelCall: "none";
  readonly persistence: "none";
  readonly evidence: readonly string[];
}

export function bridgeSidebarEvents(input: SidebarEventBridgeInput = {}): SidebarEventBridgeResult {
  const maxEvents = input.maxEvents ?? 20;
  const events: SidebarEvent[] = [...(input.events ?? [])];

  for (const command of input.commandResults ?? []) {
    events.push(createSidebarEvent({
      kind: "command",
      severity: severityForOutcome(command.outcome),
      visibility: "user-visible",
      source: "slash-command",
      timestamp: command.timestamp,
      title: command.command,
      summary: `${command.outcome}: ${command.summary}`,
      rawContent: command.rawOutput,
      evidence: ["sidebar-event-bridge:command-result"],
    }));
  }
  if (input.compact) {
    events.push(createSidebarEvent({
      kind: "compact",
      severity: input.compact.checkpointStatus === "invalid" ? "blocked" : "info",
      visibility: "user-visible",
      source: "compact",
      timestamp: input.compact.timestamp,
      title: "Compact",
      summary: `checkpoint ${input.compact.checkpointId ?? "unknown"}: ${input.compact.checkpointStatus ?? "unknown"}; injection: ${input.compact.injectionStatus ?? "unknown"}`,
      references: input.compact.checkpointId ? [input.compact.checkpointId] : [],
      evidence: ["sidebar-event-bridge:compact"],
    }));
  }
  for (const memory of input.memory ?? []) {
    events.push(createSidebarEvent({
      kind: "memory",
      severity: memory.status === "blocked" || memory.status === "invalid" ? "blocked" : "info",
      visibility: "user-visible",
      source: "memory",
      timestamp: memory.timestamp,
      title: `Memory ${memory.action}`,
      summary: `${memory.status}; records: ${memory.recordCount ?? 0}${memory.query ? `; query: ${memory.query}` : ""}; auto-injected: no`,
      rawContent: memory.rawMemoryText,
      evidence: ["sidebar-event-bridge:memory"],
    }));
  }
  if (input.warmup) {
    events.push(createSidebarEvent({
      kind: "warmup",
      severity: input.warmup.outcome === "blocked" ? "blocked" : "info",
      visibility: "user-visible",
      source: "warmup",
      timestamp: input.warmup.timestamp,
      title: "Warmup",
      summary: `${input.warmup.outcome}; found: ${input.warmup.found === undefined ? "unknown" : input.warmup.found ? "yes" : "no"}; staleness: ${input.warmup.staleness ?? "unknown"}; startup auto-load: no`,
      evidence: ["sidebar-event-bridge:warmup"],
    }));
  }
  for (const validation of input.validation ?? []) {
    events.push(createSidebarEvent({
      kind: "validation",
      severity: validation.status === "passed" ? "success" : "warning",
      visibility: "user-visible",
      source: "validation",
      timestamp: validation.timestamp,
      title: validation.command,
      summary: validation.status,
      rawContent: validation.fullOutput,
      evidence: ["sidebar-event-bridge:validation"],
    }));
  }
  if (input.edit) {
    events.push(createSidebarEvent({
      kind: "edit",
      severity: (input.edit.failedFileCount ?? 0) > 0 ? "warning" : "success",
      visibility: "user-visible",
      source: "session-runtime",
      timestamp: input.edit.timestamp,
      title: "Edit activity",
      summary: `changed files: ${input.edit.changedFileCount ?? 0}; failed files: ${input.edit.failedFileCount ?? 0}`,
      rawContent: input.edit.rawOriginalContent,
      evidence: ["sidebar-event-bridge:edit"],
    }));
  }
  for (const tool of input.tools ?? []) {
    events.push(createSidebarEvent({
      kind: "tool",
      severity: tool.status === "available" ? "success" : tool.status === "unavailable" ? "warning" : "info",
      visibility: "user-visible",
      source: "tool-availability",
      timestamp: tool.timestamp,
      title: tool.label,
      summary: `availability: ${tool.status}; discovery not run unless explicitly supplied`,
      evidence: ["sidebar-event-bridge:tool-availability"],
    }));
  }
  if (input.route) {
    events.push(createSidebarEvent({
      kind: "route",
      severity: input.route.status.includes("blocked") ? "blocked" : "info",
      visibility: "user-visible",
      source: "route",
      timestamp: input.route.timestamp,
      title: input.route.routeId ?? "Route",
      summary: input.route.status,
      nextAction: input.route.nextAction,
      evidence: ["sidebar-event-bridge:route"],
    }));
  }
  for (const warning of input.warnings ?? []) {
    events.push(createSidebarEvent({
      id: `warning:${warning.id}`,
      kind: "warning",
      severity: "warning",
      visibility: "user-visible",
      source: "route",
      timestamp: warning.timestamp,
      title: "Warning",
      summary: warning.message,
      evidence: ["sidebar-event-bridge:warning"],
    }));
  }
  for (const blocker of input.blockers ?? []) {
    events.push(createSidebarEvent({
      id: `blocker:${blocker.id}`,
      kind: "blocker",
      severity: "blocked",
      visibility: "user-visible",
      source: "route",
      timestamp: blocker.timestamp,
      title: "Blocker",
      summary: blocker.message,
      evidence: ["sidebar-event-bridge:blocker"],
    }));
  }

  const ordered = deterministicOrder(events);
  const droppedEventCount = Math.max(0, ordered.length - maxEvents);
  return {
    events: ordered.slice(-maxEvents),
    droppedEventCount,
    providerCall: "none",
    modelCall: "none",
    persistence: "none",
    evidence: [
      "sidebar-event-bridge:read-only",
      "sidebar-event-bridge:explicit-inputs-only",
      "sidebar-event-bridge:deterministic-order",
      "sidebar-event-bridge:no-provider-or-model-call",
      "sidebar-event-bridge:no-persistence",
    ],
  };
}

function deterministicOrder(events: readonly SidebarEvent[]): SidebarEvent[] {
  return [...events].sort((left, right) => {
    const byTime = (left.timestamp ?? "").localeCompare(right.timestamp ?? "");
    if (byTime !== 0) {
      return byTime;
    }
    return left.id.localeCompare(right.id);
  });
}

function severityForOutcome(
  outcome: NonNullable<SidebarEventBridgeInput["commandResults"]>[number]["outcome"],
): SidebarEvent["severity"] {
  if (outcome === "success") {
    return "success";
  }
  if (outcome === "blocked") {
    return "blocked";
  }
  if (outcome === "error") {
    return "error";
  }
  return "info";
}
