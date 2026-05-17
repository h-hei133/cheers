import { getLatestCompactCheckpoint } from "../context/compactLiveCheckpoint.js";
import { parseSidebarPanelCommandArgs } from "../context/sidebarPanelCommandContract.js";
import { runSidebarPanelCommand } from "../context/sidebarPanelCommandRunner.js";
import { projectSidebarState } from "../context/sidebarStateProjection.js";
import { renderSidebarStateSurface } from "../context/sidebarStateSurface.js";
import {
  sidebarLiveEventStoreForContext,
  sidebarSessionScopeId,
} from "./sidebarCommandEvents.js";
import type { CommandContext, LocalCommandResult } from "./types.js";

export async function runSidebarLocalCommand(
  args: string[],
  context: CommandContext,
): Promise<LocalCommandResult> {
  const parsed = parseSidebarPanelCommandArgs(args);
  if (!parsed.ok || !parsed.contract) {
    return {
      kind: "local",
      output: parsed.errorOutput ?? "Unsupported /sidebar arguments.",
    };
  }
  const sessionScopeId = sidebarSessionScopeId(context);
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
  const liveEvents = sidebarLiveEventStoreForContext(context).listRecent({
    sessionScopeId,
    maxEvents: 20,
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
    events: liveEvents.events,
    bridgeDroppedEventCount: liveEvents.droppedEventCount,
    nextAction: "Use route-specific docs and focused tests to decide the next implementation step.",
  });

  if (parsed.contract.mode === "panel") {
    const panel = runSidebarPanelCommand({ snapshot, contract: parsed.contract });
    return {
      kind: "local",
      output: panel.output,
    };
  }

  return {
    kind: "local",
    output: renderSidebarStateSurface(snapshot),
  };
}
