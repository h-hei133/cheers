import { buildSidebarPanel } from "./sidebarPanelLayout.js";
import {
  createSidebarPanel,
  createSidebarPanelSection,
  sanitizePanelText,
  sidebarPanelBudgetForDensity,
  type SidebarPanel,
  type SidebarPanelBudget,
  type SidebarPanelDensity,
  type SidebarPanelLine,
} from "./sidebarPanelModel.js";
import { projectSidebarActivity } from "./sidebarActivityProjection.js";
import {
  createSidebarEvent,
  type SidebarEvent,
  type SidebarEventInput,
} from "./sidebarEventModel.js";
import type { SidebarLiveEventStore } from "./sidebarLiveEventStore.js";
import { createSidebarStateSnapshot, type SidebarStateSnapshot } from "./sidebarStateModel.js";

export interface SidebarLivePanelFrame {
  readonly frameNumber: number;
  readonly updatedAt: string;
  readonly snapshot: SidebarStateSnapshot;
  readonly panel: SidebarPanel;
  readonly metadata: {
    readonly eventCount: number;
    readonly totalStoredEventCount: number;
    readonly droppedEventCount: number;
    readonly warningCount: number;
    readonly blockerCount: number;
  };
  readonly evidence: readonly string[];
}

export interface SidebarLivePanelRuntimeTickInput {
  readonly snapshot?: SidebarStateSnapshot;
  readonly events?: readonly (SidebarEvent | SidebarEventInput)[];
  readonly updatedAt?: string;
}

export interface SidebarLivePanelRuntime {
  tick(input?: SidebarLivePanelRuntimeTickInput): SidebarLivePanelFrame;
  frames(): readonly SidebarLivePanelFrame[];
}

export interface CreateSidebarLivePanelRuntimeInput {
  readonly snapshot: SidebarStateSnapshot;
  readonly sessionScopeId: string;
  readonly eventStore?: SidebarLiveEventStore;
  readonly density?: SidebarPanelDensity;
  readonly budget?: Partial<SidebarPanelBudget>;
  readonly maxFrameHistory?: number;
  readonly maxEventsPerFrame?: number;
  readonly now?: () => string;
}

export function createSidebarLivePanelRuntime(
  input: CreateSidebarLivePanelRuntimeInput,
): SidebarLivePanelRuntime {
  let snapshot = input.snapshot;
  let frameNumber = 0;
  const frameHistory: SidebarLivePanelFrame[] = [];
  const explicitEvents: SidebarEvent[] = [];
  const maxFrameHistory = clampInteger(input.maxFrameHistory ?? 3, 1, 10);
  const maxEventsPerFrame = clampInteger(input.maxEventsPerFrame ?? 20, 0, 40);
  const density = input.density ?? "normal";
  const budget = sidebarPanelBudgetForDensity(density, input.budget);
  const now = input.now ?? (() => new Date().toISOString());

  return {
    tick(tickInput = {}) {
      snapshot = tickInput.snapshot ?? snapshot;
      const updatedAt = tickInput.updatedAt ?? now();
      if (tickInput.events) {
        for (const event of tickInput.events) {
          if (input.eventStore) {
            input.eventStore.append({
              sessionScopeId: input.sessionScopeId,
              event,
            });
          } else {
            explicitEvents.push(createSidebarEvent({
              ...event,
              id: event.id ?? `sidebar-live-explicit:${explicitEvents.length + 1}`,
              timestamp: event.timestamp ?? updatedAt,
            }));
          }
        }
      }

      const listed = input.eventStore?.listRecent({
        sessionScopeId: input.sessionScopeId,
        maxEvents: maxEventsPerFrame,
        includeDeveloperOnly: true,
      });
      const events = listed?.events ?? explicitEvents.slice(-maxEventsPerFrame);
      const totalStoredEventCount = listed?.totalStoredEventCount ?? explicitEvents.length;
      const droppedEventCount = listed?.droppedEventCount ??
        Math.max(0, explicitEvents.length - events.length);
      frameNumber += 1;
      const liveSnapshot = createSidebarStateSnapshot({
        ...snapshot,
        generatedAt: updatedAt,
        title: "Visible agent state snapshot",
        recentActivity: projectSidebarActivity({
          snapshot,
          events,
          maxVisibleEvents: budget.maxActivityItems,
          bridgeDroppedEventCount: droppedEventCount,
        }),
        evidence: [
          ...snapshot.evidence,
          "sidebar-live-panel-runtime:bounded-frame",
          "sidebar-live-panel-runtime:manual-tick",
        ],
      });
      const metadata = frameMetadata({
        events,
        totalStoredEventCount,
        droppedEventCount,
      });
      const basePanel = buildSidebarPanel(liveSnapshot, { density, budget });
      const panel = createSidebarPanel({
        title: "Visible agent state snapshot",
        density,
        budget,
        sections: [
          metadataSection({
            frameNumber,
            updatedAt,
            metadata,
            hasHiddenDeveloperEvents: liveSnapshot.recentActivity?.hasHiddenDeveloperEvents ?? false,
          }),
          ...basePanel.sections.filter((section) => section.id !== "header"),
        ],
        warnings: basePanel.warnings,
        evidence: [
          ...basePanel.evidence,
          "sidebar-live-panel-runtime:uses-sidebar-panel-layout",
          "sidebar-live-panel-runtime:no-terminal-side-effects",
        ],
      });
      const frame: SidebarLivePanelFrame = {
        frameNumber,
        updatedAt,
        snapshot: liveSnapshot,
        panel,
        metadata,
        evidence: [
          "sidebar-live-panel-runtime:read-only",
          "sidebar-live-panel-runtime:no-provider-call",
          "sidebar-live-panel-runtime:no-model-call",
          "sidebar-live-panel-runtime:no-persistence",
          "sidebar-live-panel-runtime:no-indefinite-loop",
        ],
      };
      frameHistory.push(frame);
      while (frameHistory.length > maxFrameHistory) {
        frameHistory.shift();
      }
      return frame;
    },
    frames() {
      return [...frameHistory];
    },
  };
}

function metadataSection(input: {
  readonly frameNumber: number;
  readonly updatedAt: string;
  readonly metadata: SidebarLivePanelFrame["metadata"];
  readonly hasHiddenDeveloperEvents: boolean;
}) {
  const lines: SidebarPanelLine[] = [
    line("Snapshot captured on request; run /sidebar snapshot again to refresh.", "info"),
    line(`Frame: #${input.frameNumber}; updatedAt: ${input.updatedAt}.`, "info"),
    line(
      `Events: visible ${input.metadata.eventCount}; stored ${input.metadata.totalStoredEventCount}; dropped ${input.metadata.droppedEventCount}.`,
      input.metadata.droppedEventCount > 0 ? "warning" : "info",
    ),
    line(
      `Warnings/blockers: ${input.metadata.warningCount}/${input.metadata.blockerCount}.`,
      input.metadata.blockerCount > 0
        ? "blocked"
        : input.metadata.warningCount > 0
          ? "warning"
          : "info",
    ),
    ...(input.hasHiddenDeveloperEvents
      ? [line("Developer-only sidebar events are hidden by default.", "warning")]
      : []),
  ];
  return createSidebarPanelSection({
    id: "live-frame",
    title: "Snapshot frame",
    lines,
    severity: lines.some((item) => item.severity === "blocked")
      ? "blocked"
      : lines.some((item) => item.severity === "warning")
        ? "warning"
        : "info",
  });
}

function frameMetadata(input: {
  readonly events: readonly SidebarEvent[];
  readonly totalStoredEventCount: number;
  readonly droppedEventCount: number;
}): SidebarLivePanelFrame["metadata"] {
  return {
    eventCount: input.events.filter((event) => event.visibility === "user-visible").length,
    totalStoredEventCount: input.totalStoredEventCount,
    droppedEventCount: input.droppedEventCount,
    warningCount: input.events.filter((event) =>
      event.kind === "warning" || event.severity === "warning"
    ).length,
    blockerCount: input.events.filter((event) =>
      event.kind === "blocker" ||
      event.severity === "blocked" ||
      event.severity === "error"
    ).length,
  };
}

function line(text: string, severity: SidebarPanelLine["severity"]): SidebarPanelLine {
  return { text: sanitizePanelText(text), severity };
}

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, Math.floor(value)));
}
