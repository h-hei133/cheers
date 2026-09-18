import {
  createSidebarEvent,
  sidebarEventHasForbiddenContent,
  type SidebarEvent,
  type SidebarEventInput,
} from "./sidebarEventModel.js";

export class SidebarEventSafetyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SidebarEventSafetyError";
  }
}

export interface SidebarLiveEventStoreOptions {
  readonly maxEventsPerSession?: number;
  readonly now?: () => string;
  readonly nextId?: () => string;
}

export interface SidebarLiveEventAppendInput {
  readonly sessionScopeId: string;
  readonly event: SidebarEventInput | SidebarEvent;
}

export interface SidebarLiveEventListInput {
  readonly sessionScopeId: string;
  readonly maxEvents?: number;
  readonly includeDeveloperOnly?: boolean;
}

export interface SidebarLiveEventListResult {
  readonly events: readonly SidebarEvent[];
  readonly droppedEventCount: number;
  readonly totalStoredEventCount: number;
  readonly evidence: readonly string[];
}

export interface SidebarLiveEventStore {
  append(input: SidebarLiveEventAppendInput): SidebarEvent;
  appendMany(input: {
    readonly sessionScopeId: string;
    readonly events: readonly (SidebarEventInput | SidebarEvent)[];
  }): readonly SidebarEvent[];
  listRecent(input: SidebarLiveEventListInput): SidebarLiveEventListResult;
  clear(sessionScopeId?: string): void;
}

export function createSidebarLiveEventStore(
  options: SidebarLiveEventStoreOptions = {},
): SidebarLiveEventStore {
  const maxEventsPerSession = Math.max(1, options.maxEventsPerSession ?? 40);
  const now = options.now ?? (() => new Date().toISOString());
  const nextId = options.nextId ?? defaultNextId();
  const sessions = new Map<string, SidebarEvent[]>();

  return {
    append(input) {
      const event = sanitizeLiveEvent(input.event, now, nextId);
      const events = sessions.get(input.sessionScopeId) ?? [];
      events.push(event);
      trimSessionEvents(events, maxEventsPerSession);
      sessions.set(input.sessionScopeId, events);
      return event;
    },
    appendMany(input) {
      return input.events.map((event) =>
        this.append({ sessionScopeId: input.sessionScopeId, event }),
      );
    },
    listRecent(input) {
      const maxEvents = Math.max(0, input.maxEvents ?? 12);
      const events = sessions.get(input.sessionScopeId) ?? [];
      const visible = events.filter((event) =>
        event.visibility === "user-visible" ||
        (input.includeDeveloperOnly && event.visibility === "developer-only")
      );
      const selected = selectBudgetedEvents(visible, maxEvents);
      return {
        events: selected,
        droppedEventCount: Math.max(0, visible.length - selected.length),
        totalStoredEventCount: events.length,
        evidence: [
          "sidebar-live-event-store:session-scoped",
          "sidebar-live-event-store:in-memory",
          "sidebar-live-event-store:budgeted",
          "sidebar-live-event-store:critical-preserved",
          "sidebar-live-event-store:no-persistence",
        ],
      };
    },
    clear(sessionScopeId) {
      if (sessionScopeId) {
        sessions.delete(sessionScopeId);
        return;
      }
      sessions.clear();
    },
  };
}

export const DEFAULT_SIDEBAR_LIVE_EVENT_STORE =
  createSidebarLiveEventStore();

function sanitizeLiveEvent(
  event: SidebarEventInput | SidebarEvent,
  now: () => string,
  nextId: () => string,
): SidebarEvent {
  const sanitized = createSidebarEvent({
    ...event,
    id: event.id ?? nextId(),
    timestamp: event.timestamp ?? now(),
    evidence: [
      ...(event.evidence ?? []),
      "sidebar-live-event-store:redacted-on-append",
    ],
  });
  if (sidebarEventHasForbiddenContent(sanitized)) {
    throw new SidebarEventSafetyError(
      "Sidebar live event rejected because sanitized output still contained forbidden content.",
    );
  }
  return sanitized;
}

function trimSessionEvents(events: SidebarEvent[], maxEvents: number): void {
  while (events.length > maxEvents) {
    const removable = events.findIndex((event) => !isCriticalEvent(event));
    events.splice(removable >= 0 ? removable : 0, 1);
  }
}

function selectBudgetedEvents(
  events: readonly SidebarEvent[],
  maxEvents: number,
): readonly SidebarEvent[] {
  if (maxEvents === 0) {
    return [];
  }
  const ordered = orderEvents(events);
  if (ordered.length <= maxEvents) {
    return ordered;
  }
  const critical = ordered.filter(isCriticalEvent);
  const normal = ordered.filter((event) => !isCriticalEvent(event));
  const criticalSelection = critical.slice(-maxEvents);
  const normalBudget = Math.max(0, maxEvents - criticalSelection.length);
  return orderEvents([
    ...criticalSelection,
    ...normal.slice(-normalBudget),
  ]);
}

function orderEvents(events: readonly SidebarEvent[]): readonly SidebarEvent[] {
  return [...events].sort((left, right) => {
    const byTime = (left.timestamp ?? "").localeCompare(right.timestamp ?? "");
    if (byTime !== 0) {
      return byTime;
    }
    return left.id.localeCompare(right.id);
  });
}

function isCriticalEvent(event: SidebarEvent): boolean {
  return (
    event.kind === "warning" ||
    event.kind === "blocker" ||
    event.severity === "warning" ||
    event.severity === "blocked" ||
    event.severity === "error"
  );
}

function defaultNextId(): () => string {
  let index = 0;
  return () => {
    index += 1;
    return `sidebar-live-event:${index}`;
  };
}
