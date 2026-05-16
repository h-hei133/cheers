import { getLatestCompactCheckpoint } from "../context/compactLiveCheckpoint.js";
import { bridgeSidebarEvents } from "../context/sidebarEventBridge.js";
import { projectSidebarState } from "../context/sidebarStateProjection.js";
import { renderSidebarStateSurface } from "../context/sidebarStateSurface.js";
import type { CommandContext, LocalCommandResult } from "./types.js";

export async function runSidebarLocalCommand(
  _args: string[],
  context: CommandContext,
): Promise<LocalCommandResult> {
  const sessionScopeId = `session:${context.sessionId ?? "command-preview"}`;
  const compactCheckpoint = context.compactCheckpointStore
    ? getLatestCompactCheckpoint(context.compactCheckpointStore, sessionScopeId)
    : undefined;
  const compactInjectionState = context.compactInjectionStateStore?.get(sessionScopeId);
  const projectMemoryReviewState = context.projectMemoryReviewStateStore?.get(sessionScopeId);
  const projectMemoryInjectionState = context.projectMemoryInjectionStateStore?.get(sessionScopeId);
  const projectMemoryStoreHealth = context.projectMemoryStore
    ? await context.projectMemoryStore.health()
    : undefined;
  const projectMemoryRecords = context.projectMemoryStore
    ? (await context.projectMemoryStore.list()).records
    : undefined;
  const startupWarmHealth = context.startupWarmContextCacheStore
    ? await context.startupWarmContextCacheStore.health()
    : undefined;
  const startupWarmRead = context.startupWarmContextCacheStore
    ? await context.startupWarmContextCacheStore.read()
    : undefined;
  const bridgedEvents = bridgeSidebarEvents({
    commandResults: [{
      command: "/sidebar",
      outcome: "status",
      summary: "Rendered visible state preview with recent activity bridge.",
    }],
    compact: compactCheckpoint || compactInjectionState
      ? {
          checkpointId: compactCheckpoint?.checkpointId ?? compactInjectionState?.checkpointId,
          checkpointStatus: compactCheckpoint?.status,
          injectionStatus: compactInjectionState?.injectionStatus,
        }
      : undefined,
    memory: [
      ...(projectMemoryReviewState
        ? [{
            action: "review" as const,
            status: "available",
            recordCount: projectMemoryReviewState.latestCandidates.length,
          }]
        : []),
      ...(projectMemoryInjectionState && projectMemoryInjectionState.injectionStatus !== "none"
        ? [{
            action: "use" as const,
            status: projectMemoryInjectionState.injectionStatus,
            recordCount: projectMemoryInjectionState.recordIds.length,
            query: projectMemoryInjectionState.query,
          }]
        : []),
      ...(projectMemoryRecords
        ? [{
            action: "recall" as const,
            status: "active-records",
            recordCount: projectMemoryRecords.length,
          }]
        : []),
    ],
    warmup: startupWarmHealth
      ? {
          outcome: "status",
          found: startupWarmHealth.found,
          staleness: startupWarmHealth.staleness,
        }
      : undefined,
    route: {
      status: "sidebar event bridge preview",
      nextAction: "Use route-specific docs and focused tests to decide the next implementation step.",
    },
    tools: [{ label: "/sidebar", status: "available" }],
  });

  const snapshot = projectSidebarState({
    task: {
      title: "visible agent state",
      objective: "Preview shared visible agent state and recent activity without building a sidebar UI.",
      constraints: [
        "read-only",
        "no dynamic MCP/skills discovery",
        "no provider/model calls",
        "no automatic memory/startup injection",
      ],
    },
    compactCheckpoint,
    compactInjectionState,
    projectMemoryReviewState,
    projectMemoryInjectionState,
    projectMemoryRecords,
    projectMemoryStoreHealth,
    startupWarmHealth,
    startupWarmCache: startupWarmRead?.cache,
    toolAvailability: {
      localCommands: [
        {
          id: "sidebar",
          label: "/sidebar",
          status: "available",
          summary: "Read-only visible state preview command.",
          evidence: ["sidebar-command:registered"],
        },
      ],
    },
    events: bridgedEvents.events,
    bridgeDroppedEventCount: bridgedEvents.droppedEventCount,
    nextAction: "Use route-specific docs and focused tests to decide the next implementation step.",
  });

  return {
    kind: "local",
    output: renderSidebarStateSurface(snapshot),
  };
}
