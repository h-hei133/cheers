import {
  adaptCommandResultToSidebarEvent,
  emitSidebarCommandResult,
} from "../../presentation/sidebar/sidebarCommandEventAdapter.js";
import {
  createSidebarEventSink,
  type SidebarEventSink,
} from "../../presentation/sidebar/sidebarEventSink.js";
import {
  DEFAULT_SIDEBAR_LIVE_EVENT_STORE,
  type SidebarLiveEventStore,
} from "../../presentation/sidebar/sidebarLiveEventStore.js";
import type { CommandContext, LocalCommandResult } from "./types.js";

export function sidebarSessionScopeId(context: CommandContext): string {
  return context.sessionId ? `session:${context.sessionId}` : `cwd:${context.cwd}`;
}

export function sidebarLiveEventStoreForContext(
  context: CommandContext,
): SidebarLiveEventStore {
  return context.sidebarLiveEventStore ?? DEFAULT_SIDEBAR_LIVE_EVENT_STORE;
}

export function sidebarEventSinkForContext(
  context: CommandContext,
): SidebarEventSink {
  return (
    context.sidebarEventSink ??
    createSidebarEventSink({
      sessionScopeId: sidebarSessionScopeId(context),
      store: sidebarLiveEventStoreForContext(context),
    })
  );
}

export function emitCommandResultToSidebar(
  context: CommandContext,
  input: {
    readonly command: string;
    readonly args: readonly string[];
    readonly result: LocalCommandResult;
  },
): void {
  emitSidebarCommandResult(sidebarEventSinkForContext(context), input);
}

export function emitDeveloperOnlySidebarRendered(
  context: CommandContext,
  result: LocalCommandResult,
): void {
  const sink = sidebarEventSinkForContext(context);
  const event = adaptCommandResultToSidebarEvent({
    command: "/sidebar",
    args: [],
    result,
  });
  sink.emitDeveloperOnly({
    ...event,
    title: "Sidebar rendered",
    summary: "status: sidebar preview rendered; user-visible event omitted by default",
  });
}
