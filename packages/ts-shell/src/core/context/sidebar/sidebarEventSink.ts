import {
  type SidebarEventInput,
  type SidebarEventKind,
  type SidebarEventSeverity,
  type SidebarEventSource,
} from "./sidebarEventModel.js";
import {
  DEFAULT_SIDEBAR_LIVE_EVENT_STORE,
  type SidebarLiveEventStore,
} from "./sidebarLiveEventStore.js";

export interface SidebarEventSinkEmitInput {
  readonly kind?: SidebarEventKind;
  readonly severity?: SidebarEventSeverity;
  readonly source?: SidebarEventSource;
  readonly title: string;
  readonly summary: string;
  readonly timestamp?: string;
  readonly references?: readonly string[];
  readonly redactions?: readonly string[];
  readonly rawContent?: string;
  readonly nextAction?: string;
  readonly evidence?: readonly string[];
}

export interface SidebarEventSink {
  emitUserVisible(input: SidebarEventSinkEmitInput): void;
  emitDeveloperOnly(input: SidebarEventSinkEmitInput): void;
  emitWarning(input: SidebarEventSinkEmitInput): void;
  emitBlocker(input: SidebarEventSinkEmitInput): void;
}

export interface SidebarEventSinkOptions {
  readonly sessionScopeId: string;
  readonly store?: SidebarLiveEventStore;
}

export const NOOP_SIDEBAR_EVENT_SINK: SidebarEventSink = {
  emitUserVisible: () => {},
  emitDeveloperOnly: () => {},
  emitWarning: () => {},
  emitBlocker: () => {},
};

export function createSidebarEventSink(
  options: SidebarEventSinkOptions,
): SidebarEventSink {
  const store = options.store ?? DEFAULT_SIDEBAR_LIVE_EVENT_STORE;
  return {
    emitUserVisible(input) {
      store.append({
        sessionScopeId: options.sessionScopeId,
        event: toEventInput(input, "user-visible"),
      });
    },
    emitDeveloperOnly(input) {
      store.append({
        sessionScopeId: options.sessionScopeId,
        event: toEventInput(input, "developer-only"),
      });
    },
    emitWarning(input) {
      store.append({
        sessionScopeId: options.sessionScopeId,
        event: toEventInput(
          {
            ...input,
            kind: input.kind ?? "warning",
            severity: input.severity ?? "warning",
          },
          "user-visible",
        ),
      });
    },
    emitBlocker(input) {
      store.append({
        sessionScopeId: options.sessionScopeId,
        event: toEventInput(
          {
            ...input,
            kind: input.kind ?? "blocker",
            severity: input.severity ?? "blocked",
          },
          "user-visible",
        ),
      });
    },
  };
}

function toEventInput(
  input: SidebarEventSinkEmitInput,
  visibility: SidebarEventInput["visibility"],
): SidebarEventInput {
  return {
    kind: input.kind ?? "command",
    severity: input.severity ?? "info",
    visibility,
    source: input.source ?? "slash-command",
    timestamp: input.timestamp,
    title: input.title,
    summary: input.summary,
    references: input.references,
    redactions: input.redactions,
    rawContent: input.rawContent,
    nextAction: input.nextAction,
    evidence: [
      ...(input.evidence ?? []),
      "sidebar-event-sink:explicit-command-emission",
      "sidebar-event-sink:no-provider-call",
      "sidebar-event-sink:no-persistence",
    ],
  };
}
