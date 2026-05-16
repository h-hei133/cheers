import type { CompactInjectionState } from "./compactInjectionState.js";
import type { CompactLiveCheckpoint } from "./compactLiveCheckpoint.js";
import type { ProjectMemoryInjectionState } from "./projectMemoryInjectionState.js";
import type { ProjectMemoryRecord, ProjectMemoryStoreHealth } from "./projectMemoryStoreContract.js";
import type { ProjectMemoryReviewState } from "./projectMemoryReviewState.js";
import type { StartupWarmContextCache } from "./startupWarmContextCache.js";
import type { StartupWarmContextCacheHealth } from "./startupWarmContextHealth.js";
import { projectSidebarActivity } from "./sidebarActivityProjection.js";
import type { SidebarEvent } from "./sidebarEventModel.js";
import {
  createSidebarStateSnapshot,
  sanitizeSidebarText,
  type SidebarFact,
  type SidebarNextAction,
  type SidebarNotice,
  type SidebarSource,
  type SidebarStateSnapshot,
} from "./sidebarStateModel.js";
import {
  normalizeSidebarToolAvailability,
  sidebarToolAvailabilityFacts,
  type SidebarToolAvailabilityInput,
} from "./sidebarToolAvailability.js";

export interface SidebarStateProjectionInput {
  readonly generatedAt?: string;
  readonly task?: {
    readonly routeId?: string;
    readonly title?: string;
    readonly objective?: string;
    readonly changed?: readonly string[];
    readonly constraints?: readonly string[];
  };
  readonly editCloseout?: {
    readonly status: string;
    readonly readiness?: string;
    readonly restorable?: string;
    readonly evidence?: readonly string[];
    readonly warnings?: readonly string[];
  };
  readonly mutationEvidence?: {
    readonly changedFiles?: readonly string[];
    readonly failedFiles?: ReadonlyArray<{ readonly path: string; readonly reason: string }>;
    readonly restorableFiles?: readonly string[];
    readonly evidence?: readonly string[];
    readonly rawOriginalContent?: string;
    readonly rawFileDump?: string;
  };
  readonly compactCheckpoint?: CompactLiveCheckpoint;
  readonly compactInjectionState?: CompactInjectionState;
  readonly projectMemoryReviewState?: ProjectMemoryReviewState;
  readonly projectMemoryInjectionState?: ProjectMemoryInjectionState;
  readonly projectMemoryRecords?: readonly ProjectMemoryRecord[];
  readonly projectMemoryStoreHealth?: ProjectMemoryStoreHealth;
  readonly startupWarmHealth?: StartupWarmContextCacheHealth;
  readonly startupWarmCache?: StartupWarmContextCache;
  readonly validation?: {
    readonly testsRun?: readonly string[];
    readonly verifierResults?: ReadonlyArray<{ readonly command: string; readonly status: string }>;
    readonly buildStatus?: string;
    readonly resultContractStatus?: string;
    readonly evidence?: readonly string[];
    readonly fullCommandOutput?: string;
  };
  readonly toolAvailability?: SidebarToolAvailabilityInput;
  readonly events?: readonly SidebarEvent[];
  readonly maxVisibleActivityEvents?: number;
  readonly bridgeDroppedEventCount?: number;
  readonly warnings?: ReadonlyArray<{ readonly id: string; readonly message: string; readonly source?: SidebarSource }>;
  readonly blockers?: ReadonlyArray<{ readonly id: string; readonly message: string; readonly source?: SidebarSource }>;
  readonly nextAction?: string;
}

export function projectSidebarState(
  input: SidebarStateProjectionInput = {},
): SidebarStateSnapshot {
  const facts: SidebarFact[] = [];
  const notices: SidebarNotice[] = [];
  const nextActions: SidebarNextAction[] = [];
  const redactions = new Set<string>();

  projectTask(input, facts);
  projectEdit(input, facts, notices);
  projectCompact(input, facts, notices);
  projectMemory(input, facts, notices);
  projectWarmup(input, facts, notices);
  projectValidation(input, facts, notices, redactions);
  projectTools(input, facts);
  projectExplicitNotices(input, notices);
  projectNextAction(input, nextActions);

  collectRawContentRedactions(input, redactions);

  const baseSnapshot = createSidebarStateSnapshot({
    generatedAt: input.generatedAt,
    title: "Visible agent state preview",
    facts,
    notices,
    nextActions,
    redactions: Array.from(redactions),
    evidence: [
      "sidebar-state-projection:pure",
      "sidebar-state-projection:explicit-inputs-only",
      "sidebar-state-projection:read-only",
      "sidebar-state-projection:no-provider-call",
      "sidebar-state-projection:no-auto-injection",
    ],
  });
  if (!input.events) {
    return baseSnapshot;
  }
  return createSidebarStateSnapshot({
    ...baseSnapshot,
    recentActivity: projectSidebarActivity({
      snapshot: baseSnapshot,
      events: input.events,
      maxVisibleEvents: input.maxVisibleActivityEvents,
      bridgeDroppedEventCount: input.bridgeDroppedEventCount,
    }),
  });
}

function projectTask(input: SidebarStateProjectionInput, facts: SidebarFact[]): void {
  const task = input.task;
  if (!task) {
    facts.push(fact("task-route:unknown", "task-route", "info", "status", "route", "Task / route", "No current route or task was supplied."));
    return;
  }
  const title = [task.routeId, task.title].filter(Boolean).join(": ") || "Current task";
  const changed = task.changed?.length ? ` Changed: ${task.changed.join(", ")}.` : "";
  facts.push(fact(
    "task-route:current",
    "task-route",
    "info",
    "status",
    "route",
    title,
    `${task.objective ?? "Task objective not supplied."}${changed}`,
    ["sidebar-state-projection:task-route"],
  ));
  if (task.constraints?.length) {
    facts.push(fact(
      "task-route:constraints",
      "task-route",
      "info",
      "evidence",
      "route",
      "Constraints",
      task.constraints.join("; "),
      ["sidebar-state-projection:task-constraints"],
    ));
  }
}

function projectEdit(
  input: SidebarStateProjectionInput,
  facts: SidebarFact[],
  notices: SidebarNotice[],
): void {
  const edit = input.editCloseout;
  if (!edit && !input.mutationEvidence) {
    facts.push(fact("edit:unknown", "edit", "info", "status", "edit-closeout", "Edit", "No edit closeout or mutation evidence was supplied."));
    return;
  }
  if (edit) {
    facts.push(fact(
      "edit:closeout",
      "edit",
      edit.status.includes("blocked") ? "warning" : "info",
      "status",
      "edit-closeout",
      "Edit closeout",
      [edit.status, edit.readiness, edit.restorable].filter(Boolean).join(" | "),
      edit.evidence ?? ["sidebar-state-projection:edit-closeout"],
    ));
    for (const warning of edit.warnings ?? []) {
      notices.push(notice("edit:warning", "warning", "edit-closeout", warning));
    }
  }
  const mutation = input.mutationEvidence;
  if (mutation) {
    facts.push(fact(
      "edit:mutation-evidence",
      "edit",
      (mutation.failedFiles?.length ?? 0) > 0 ? "warning" : "success",
      "evidence",
      "edit-closeout",
      "Mutation evidence",
      `Changed files: ${mutation.changedFiles?.length ?? 0}; failed files: ${mutation.failedFiles?.length ?? 0}; restorable files: ${mutation.restorableFiles?.length ?? 0}.`,
      mutation.evidence ?? ["sidebar-state-projection:mutation-evidence"],
    ));
    for (const failed of mutation.failedFiles ?? []) {
      notices.push(notice(
        `edit:failed:${failed.path}`,
        "warning",
        "edit-closeout",
        `${failed.path}: ${failed.reason}`,
      ));
    }
  }
}

function projectCompact(
  input: SidebarStateProjectionInput,
  facts: SidebarFact[],
  notices: SidebarNotice[],
): void {
  const checkpoint = input.compactCheckpoint;
  const injection = input.compactInjectionState;
  if (!checkpoint && !injection) {
    facts.push(fact("compact:missing", "compact", "info", "status", "compact", "Compact", "No Compact v2 checkpoint or injection state was supplied."));
    return;
  }
  if (checkpoint) {
    facts.push(fact(
      "compact:checkpoint",
      "compact",
      checkpoint.status === "created" ? "success" : "warning",
      "status",
      "compact",
      "Compact checkpoint",
      `Checkpoint ${checkpoint.checkpointId} is ${checkpoint.status}; next action: ${checkpoint.packetSummary.nextAction ?? "not supplied"}.`,
      checkpoint.evidence,
    ));
    for (const warning of checkpoint.warnings) {
      notices.push(notice(`compact:checkpoint:${warning.id}`, "warning", "compact", warning.message));
    }
  }
  if (injection) {
    facts.push(fact(
      "compact:injection",
      "compact",
      injection.injectionStatus === "invalid" ? "blocked" : "info",
      "status",
      "compact",
      "Compact injection",
      `Future-turn injection status: ${injection.injectionStatus}. Automatic injection is not implied by this sidebar preview.`,
      injection.evidence,
    ));
    for (const warning of injection.warnings) {
      notices.push(notice(`compact:injection:${warning.id}`, "warning", "compact", warning.message));
    }
  }
}

function projectMemory(
  input: SidebarStateProjectionInput,
  facts: SidebarFact[],
  notices: SidebarNotice[],
): void {
  const review = input.projectMemoryReviewState;
  const injection = input.projectMemoryInjectionState;
  const activeRecords = (input.projectMemoryRecords ?? []).filter((record) => !record.invalidatedAt);
  if (!review && !injection && !input.projectMemoryRecords && !input.projectMemoryStoreHealth) {
    facts.push(fact("memory:missing", "memory", "info", "status", "memory", "Memory", "No project memory state was supplied."));
    return;
  }
  if (review) {
    facts.push(fact(
      "memory:review",
      "memory",
      "info",
      "status",
      "memory",
      "Memory review",
      `Candidates: ${review.latestCandidates.length}; approved: ${review.approvedCandidates.length}; rejected: ${review.rejectedCandidates.length}; unsafe: ${review.unsafeCandidates.length}.`,
      review.evidence,
    ));
  }
  if (input.projectMemoryRecords) {
    facts.push(fact(
      "memory:store",
      "memory",
      "info",
      "status",
      "memory",
      "Memory store",
      `Active records: ${activeRecords.length}; invalidated/deleted records are not shown as active facts.`,
      input.projectMemoryStoreHealth?.evidence ?? ["sidebar-state-projection:memory-record-filter"],
    ));
  }
  if (input.projectMemoryStoreHealth) {
    facts.push(fact(
      "memory:health",
      "memory",
      input.projectMemoryStoreHealth.ok ? "success" : "warning",
      "evidence",
      "memory",
      "Memory health",
      `${input.projectMemoryStoreHealth.mode}; ${input.projectMemoryStoreHealth.detail}`,
      input.projectMemoryStoreHealth.evidence,
    ));
  }
  if (injection) {
    facts.push(fact(
      "memory:injection",
      "memory",
      injection.injectionStatus === "invalid" ? "blocked" : "info",
      "status",
      "memory",
      "Memory injection",
      `Explicit future-turn use status: ${injection.injectionStatus}; mode: ${injection.mode ?? "unknown"}; records: ${injection.recordIds.length}; auto-injected: no.`,
      injection.evidence,
    ));
    for (const warning of injection.warnings) {
      notices.push(notice(`memory:injection:${warning.id}`, "warning", "memory", warning.message));
    }
  }
}

function projectWarmup(
  input: SidebarStateProjectionInput,
  facts: SidebarFact[],
  notices: SidebarNotice[],
): void {
  const health = input.startupWarmHealth;
  if (!health && !input.startupWarmCache) {
    facts.push(fact("warmup:missing", "warmup", "info", "status", "warmup", "Warmup", "No startup warm cache state was supplied."));
    return;
  }
  if (health) {
    facts.push(fact(
      "warmup:health",
      "warmup",
      health.ok ? "info" : "warning",
      "status",
      "warmup",
      "Warmup cache",
      `Mode: ${health.mode}; found: ${health.found ? "yes" : "no"}; staleness: ${health.staleness}; startup auto-load: no.`,
      health.evidence,
    ));
    if (!health.ok) {
      notices.push(notice("warmup:health", "warning", "warmup", health.detail, health.evidence));
    }
  }
  if (input.startupWarmCache) {
    facts.push(fact(
      "warmup:summary",
      "warmup",
      input.startupWarmCache.staleness === "fresh" ? "success" : "warning",
      "evidence",
      "warmup",
      "Warmup summary",
      `Safe summaries available; injected into model: no; staleness: ${input.startupWarmCache.staleness}.`,
      input.startupWarmCache.sourceSummary.generatedFrom,
    ));
  }
}

function projectValidation(
  input: SidebarStateProjectionInput,
  facts: SidebarFact[],
  notices: SidebarNotice[],
  redactions: Set<string>,
): void {
  const validation = input.validation;
  if (!validation) {
    facts.push(fact("validation:missing", "validation", "info", "status", "validation", "Validation", "No validation evidence was supplied."));
    return;
  }
  const failing = (validation.verifierResults ?? []).filter((result) => result.status !== "passed");
  facts.push(fact(
    "validation:summary",
    "validation",
    failing.length > 0 ? "warning" : "success",
    "evidence",
    "validation",
    "Validation",
    `Tests: ${validation.testsRun?.length ?? 0}; verifiers: ${validation.verifierResults?.length ?? 0}; build: ${validation.buildStatus ?? "not supplied"}; result contract: ${validation.resultContractStatus ?? "not supplied"}.`,
    validation.evidence ?? ["sidebar-state-projection:validation"],
  ));
  for (const result of failing) {
    notices.push(notice(`validation:${result.command}`, "warning", "validation", `${result.command}: ${result.status}`));
  }
  if (validation.fullCommandOutput) {
    redactions.add("validation-full-command-output-excluded");
  }
}

function projectTools(input: SidebarStateProjectionInput, facts: SidebarFact[]): void {
  const summary = normalizeSidebarToolAvailability(input.toolAvailability);
  facts.push(...sidebarToolAvailabilityFacts(summary));
}

function projectExplicitNotices(
  input: SidebarStateProjectionInput,
  notices: SidebarNotice[],
): void {
  for (const warning of input.warnings ?? []) {
    notices.push(notice(warning.id, "warning", warning.source ?? "route", warning.message));
  }
  for (const blocker of input.blockers ?? []) {
    notices.push(notice(blocker.id, "blocked", blocker.source ?? "route", blocker.message));
  }
}

function projectNextAction(
  input: SidebarStateProjectionInput,
  nextActions: SidebarNextAction[],
): void {
  nextActions.push({
    id: "next-action:primary",
    label: "Next action",
    summary: input.nextAction ?? "Continue with the route-specific next step after reviewing warnings.",
    source: "route",
    evidence: ["sidebar-state-projection:next-action"],
  });
}

function collectRawContentRedactions(
  input: SidebarStateProjectionInput,
  redactions: Set<string>,
): void {
  if (input.mutationEvidence?.rawOriginalContent) {
    redactions.add("raw-original-content-excluded");
  }
  if (input.mutationEvidence?.rawFileDump) {
    redactions.add("raw-file-dump-excluded");
  }
  if (input.validation?.fullCommandOutput) {
    redactions.add("validation-full-output-excluded");
  }
}

function fact(
  id: string,
  section: SidebarFact["section"],
  severity: SidebarFact["severity"],
  kind: SidebarFact["kind"],
  source: SidebarFact["source"],
  label: string,
  summary: string,
  evidence: readonly string[] = ["sidebar-state-projection:fact"],
): SidebarFact {
  return {
    id,
    section,
    severity,
    kind,
    visibility: "user-visible",
    source,
    label: sanitizeSidebarText(label),
    summary: sanitizeSidebarText(summary),
    evidence,
  };
}

function notice(
  id: string,
  severity: SidebarNotice["severity"],
  source: SidebarNotice["source"],
  message: string,
  evidence: readonly string[] = ["sidebar-state-projection:notice"],
): SidebarNotice {
  return {
    id,
    severity,
    source,
    message: sanitizeSidebarText(message),
    evidence,
  };
}
