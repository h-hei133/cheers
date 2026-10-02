import { getLatestCompactCheckpoint } from "../../context/compact/checkpoint/compactLiveCheckpoint.js";
import path from "node:path";
import { projectStartupWarmContextCacheHealth } from "../../context/startup/startupWarmContextHealth.js";
import { browserCapabilitySidebarToolItem } from "../../browser/capabilitySurface.js";
import { parseSidebarLivePanelCommandArgs } from "../../presentation/sidebar/sidebarLivePanelCommandContract.js";
import { runSidebarLivePanelCommand } from "../../presentation/sidebar/sidebarLivePanelCommandRunner.js";
import { parseSidebarPanelCommandArgs } from "../../presentation/sidebar/sidebarPanelCommandContract.js";
import { runSidebarPanelCommand } from "../../presentation/sidebar/sidebarPanelCommandRunner.js";
import { projectSidebarState } from "../../presentation/sidebar/sidebarStateProjection.js";
import {
  sidebarLiveEventStoreForContext,
  sidebarSessionScopeId,
} from "./sidebarCommandEvents.js";
import type { CommandContext, LocalCommandResult } from "./types.js";

export async function runSidebarLocalCommand(
  args: string[],
  context: CommandContext,
): Promise<LocalCommandResult> {
  const snapshotParsed = ["snapshot", "watch", "live"].includes(args[0] ?? "")
    ? parseSidebarLivePanelCommandArgs(args)
    : undefined;
  const parsed = snapshotParsed ?? parseSidebarPanelCommandArgs(args);
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
  const startupWarmRead = context.startupWarmContextCacheStore
    ? context.startupWarmContextCacheStore.ref.projectRoot
      && path.resolve(context.startupWarmContextCacheStore.ref.projectRoot) !== path.resolve(context.cwd)
      ? { found: false, staleness: "invalid" as const, blocker: "Startup warm cache belongs to a different project.", evidence: ["startup-warm-context-store:project-mismatch"] }
      : await context.startupWarmContextCacheStore.read()
    : undefined;
  const startupWarmHealth = context.startupWarmContextCacheStore && startupWarmRead
    ? projectStartupWarmContextCacheHealth(context.startupWarmContextCacheStore.ref, startupWarmRead)
    : undefined;
  const liveEvents = sidebarLiveEventStoreForContext(context).listRecent({
    sessionScopeId,
    maxEvents: 20,
  });

  const snapshot = projectSidebarState({
    task: {
      title: "visible agent state",
      objective: "Read-only panel of session state, tools, and checkpoints.",
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
          label: "/sidebar snapshot",
          status: "available",
          summary: "Read-only session state captured on request.",
          evidence: ["sidebar-command:registered"],
        },
      ],
      browserTooling: [browserCapabilitySidebarToolItem()],
    },
    events: liveEvents.events,
    bridgeDroppedEventCount: liveEvents.droppedEventCount,
    nextAction: "Run /sidebar snapshot again to refresh the displayed state.",
  });

  if (parsed.contract.mode === "snapshot") {
    const snapshotResult = runSidebarLivePanelCommand({
      snapshot,
      sessionScopeId,
      eventStore: sidebarLiveEventStoreForContext(context),
      contract: parsed.contract,
    });
    return {
      kind: "local",
      output: snapshotResult.output,
    };
  }

  const panel = runSidebarPanelCommand({ snapshot, contract: parsed.contract });
  return { kind: "local", output: panel.output };
}
