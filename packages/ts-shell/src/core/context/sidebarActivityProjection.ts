import type { SidebarEvent } from "./sidebarEventModel.js";
import type {
  SidebarActivityItem,
  SidebarRecentActivity,
  SidebarStateSnapshot,
} from "./sidebarStateModel.js";

export interface SidebarActivityProjectionInput {
  readonly snapshot: SidebarStateSnapshot;
  readonly events?: readonly SidebarEvent[];
  readonly maxVisibleEvents?: number;
  readonly includeDeveloperOnly?: boolean;
  readonly bridgeDroppedEventCount?: number;
}

export function projectSidebarActivity(
  input: SidebarActivityProjectionInput,
): SidebarRecentActivity {
  const maxVisibleEvents = input.maxVisibleEvents ?? 6;
  const visiblePool = (input.events ?? []).filter((event) =>
    event.visibility === "user-visible" ||
    (input.includeDeveloperOnly && event.visibility === "developer-only")
  );
  const hiddenDeveloperCount = (input.events ?? []).filter(
    (event) => event.visibility === "developer-only" && !input.includeDeveloperOnly,
  ).length;
  const deduped = dedupeEvents(visiblePool);
  const critical = deduped.filter((event) =>
    event.kind === "warning" ||
    event.kind === "blocker" ||
    event.severity === "warning" ||
    event.severity === "blocked" ||
    event.severity === "error"
  );
  const normal = deduped.filter((event) => !critical.includes(event));
  const normalBudget = Math.max(0, maxVisibleEvents - critical.length);
  const selected = [...critical, ...normal.slice(-normalBudget)]
    .sort((left, right) => {
      const byTime = (right.timestamp ?? "").localeCompare(left.timestamp ?? "");
      if (byTime !== 0) {
        return byTime;
      }
      return left.id.localeCompare(right.id);
    });
  const latestNextAction =
    [...deduped].reverse().find((event) => event.nextAction)?.nextAction ??
    input.snapshot.nextActions[0]?.summary;

  return {
    events: selected.map(toActivityItem),
    maxVisibleEvents,
    droppedEventCount:
      Math.max(0, deduped.length - selected.length) +
      (input.bridgeDroppedEventCount ?? 0),
    dedupedEventCount: Math.max(0, visiblePool.length - deduped.length),
    hasHiddenDeveloperEvents: hiddenDeveloperCount > 0,
    latestNextAction,
    evidence: [
      "sidebar-activity-projection:recent-events",
      "sidebar-activity-projection:deduped",
      "sidebar-activity-projection:budgeted",
      "sidebar-activity-projection:critical-preserved",
    ],
  };
}

function toActivityItem(event: SidebarEvent): SidebarActivityItem {
  return {
    id: event.id,
    timestamp: event.timestamp,
    kind: event.kind,
    severity: event.severity,
    source: event.source,
    title: event.title,
    summary: event.summary,
    nextAction: event.nextAction,
    evidence: event.evidence,
  };
}

function dedupeEvents(events: readonly SidebarEvent[]): readonly SidebarEvent[] {
  const seen = new Set<string>();
  const result: SidebarEvent[] = [];
  for (const event of events) {
    const key = `${event.kind}|${event.severity}|${event.title}|${event.summary}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(event);
  }
  return result;
}
