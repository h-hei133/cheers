import { getLatestCompactCheckpoint } from "../../context/compact/checkpoint/compactLiveCheckpoint.js";
import { browserCapabilitySidebarToolItem } from "../../browser/capabilitySurface.js";
import { parseSidebarLivePanelCommandArgs } from "../../presentation/sidebar/sidebarLivePanelCommandContract.js";
import { runSidebarLivePanelCommand } from "../../presentation/sidebar/sidebarLivePanelCommandRunner.js";
import { parseSidebarPanelCommandArgs } from "../../presentation/sidebar/sidebarPanelCommandContract.js";
import { runSidebarPanelCommand } from "../../presentation/sidebar/sidebarPanelCommandRunner.js";
import { buildSidebarPanel } from "../../presentation/sidebar/sidebarPanelLayout.js";
import { renderSidebarPanel } from "../../presentation/sidebar/sidebarPanelRenderer.js";
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
  const liveParsed = args[0] === "watch" || args[0] === "live"
    ? parseSidebarLivePanelCommandArgs(args)
    : undefined;
  const parsed = liveParsed ?? parseSidebarPanelCommandArgs(args);
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
          label: "/sidebar",
          status: "available",
          summary: "Read-only visible state preview command.",
          evidence: ["sidebar-command:registered"],
        },
      ],
      browserTooling: [browserCapabilitySidebarToolItem()],
    },
    events: liveEvents.events,
    bridgeDroppedEventCount: liveEvents.droppedEventCount,
    nextAction: "Use route-specific docs and focused tests to decide the next implementation step.",
  });

  if (parsed.contract.mode === "watch") {
    const watch = runSidebarLivePanelCommand({
      snapshot,
      sessionScopeId,
      eventStore: sidebarLiveEventStoreForContext(context),
      contract: parsed.contract,
    });
    return {
      kind: "local",
      output: watch.output,
    };
  }

  if (parsed.contract.mode === "panel") {
    const panel = runSidebarPanelCommand({ snapshot, contract: parsed.contract });
    return {
      kind: "local",
      output: panel.output,
    };
  }
  // The default view: the boxed panel as an interactive overlay, with the
  // same text as the output for a caller that prints instead of opening
  // modals. The panel is the structured form of what the state surface says
  // in prose — bordered, sectioned, width-budgeted — and a full-screen modal
  // is where the surface already puts a view too structured for the
  // transcript's wrapping.
  // The boxed panel replaces the prose preview: it is the same facts, but
  // sectioned, bordered and width-budgeted — a real view rather than a
  // disclaimed one. At its standard density it runs past the pager's
  // threshold, so the interactive surface opens it full-screen with its own
  // scrolling while the transcript keeps its place; a piped session prints
  // the same text unchanged.
  const panel = buildSidebarPanel(snapshot, { density: "normal" });
  return {
    kind: "local",
    output: renderSidebarPanel(panel),
  };
}
