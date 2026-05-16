import { getLatestCompactCheckpoint } from "../context/compactLiveCheckpoint.js";
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

  const snapshot = projectSidebarState({
    task: {
      routeId: "Route 88",
      title: "sidebar state model",
      objective: "Preview shared visible agent state without building a sidebar UI.",
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
    nextAction: "Use route-specific docs and focused tests to decide the next implementation step.",
  });

  return {
    kind: "local",
    output: renderSidebarStateSurface(snapshot),
  };
}
