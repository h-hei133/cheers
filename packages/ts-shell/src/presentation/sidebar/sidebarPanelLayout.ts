import {
  createSidebarPanel,
  createSidebarPanelSection,
  sanitizePanelText,
  sidebarPanelBudgetForDensity,
  type SidebarPanel,
  type SidebarPanelBudget,
  type SidebarPanelDensity,
  type SidebarPanelLine,
  type SidebarPanelSection,
  type SidebarPanelSectionId,
  type SidebarPanelWarning,
} from "./sidebarPanelModel.js";
import {
  sidebarFactsForSection,
  type SidebarFact,
  type SidebarNotice,
  type SidebarSection,
  type SidebarSeverity,
  type SidebarStateSnapshot,
} from "./sidebarStateModel.js";

const FACT_SECTION_ORDER: ReadonlyArray<{
  readonly id: SidebarSection;
  readonly title: string;
}> = [
  { id: "task-route", title: "Task" },
  { id: "edit", title: "Edit" },
  { id: "compact", title: "Compact" },
  { id: "memory", title: "Memory" },
  { id: "warmup", title: "Warmup" },
  { id: "tools", title: "Tools" },
  { id: "validation", title: "Validation" },
];

const PROTECTED_SECTIONS = new Set<SidebarPanelSectionId>([
  "header",
  "blockers",
  "next-action",
  "footer",
]);

export interface BuildSidebarPanelOptions {
  readonly density?: SidebarPanelDensity;
  readonly budget?: Partial<SidebarPanelBudget>;
}

export function buildSidebarPanel(
  snapshot: SidebarStateSnapshot,
  options: BuildSidebarPanelOptions = {},
): SidebarPanel {
  const density = options.density ?? "normal";
  const budget = sidebarPanelBudgetForDensity(density, options.budget);
  const warnings: SidebarPanelWarning[] = [];
  const sections: SidebarPanelSection[] = [
    headerSection(snapshot),
    ...factSections(snapshot, density),
    activitySection(snapshot, density, budget, warnings),
    blockersSection(snapshot, density),
    nextActionSection(snapshot),
    footerSection(snapshot),
  ].filter((section): section is SidebarPanelSection => Boolean(section));

  const selectedSections = enforceSectionBudget(sections, budget, warnings);
  if (snapshot.recentActivity?.hasHiddenDeveloperEvents) {
    warnings.push({
      id: "developer-events-hidden",
      severity: "warning",
      message: "Developer-only sidebar events are hidden by default.",
    });
  }

  return createSidebarPanel({
    title: snapshot.title.replace("preview", "panel"),
    density,
    budget,
    sections: selectedSections,
    warnings,
    evidence: [
      "sidebar-panel-layout:deterministic-order",
      "sidebar-panel-layout:explicit-snapshot-input",
      "sidebar-panel-layout:no-provider-call",
      "sidebar-panel-layout:no-dynamic-discovery",
      "sidebar-panel-layout:no-persistence",
    ],
  });
}

function headerSection(snapshot: SidebarStateSnapshot): SidebarPanelSection {
  return createSidebarPanelSection({
    id: "header",
    title: "Sidebar panel",
    lines: [
      line("Read-only panel of session state, shown on demand.", "info"),
      line(
        `Safety: raw content ${snapshot.safety.rawContent}; provider/model calls ${snapshot.safety.providerCall}/${snapshot.safety.modelCall}.`,
        "info",
      ),
    ],
  });
}

function factSections(
  snapshot: SidebarStateSnapshot,
  density: SidebarPanelDensity,
): readonly SidebarPanelSection[] {
  const maxFacts = density === "compact" ? 1 : density === "detail" ? 4 : 2;
  const sections: SidebarPanelSection[] = [];
  for (const section of FACT_SECTION_ORDER) {
    const facts = sidebarFactsForSection(snapshot, section.id);
    const visibleFacts = density === "compact"
      ? facts.filter((fact) => !isNoisyMissingFact(fact))
      : facts;
    if (visibleFacts.length === 0 && density === "compact") {
      continue;
    }
    sections.push(createSidebarPanelSection({
      id: section.id,
      title: section.title,
      lines: formatFacts(visibleFacts.slice(0, maxFacts), facts.length),
      severity: highestSeverity(visibleFacts.map((fact) => fact.severity)),
    }));
  }
  return sections;
}

function activitySection(
  snapshot: SidebarStateSnapshot,
  density: SidebarPanelDensity,
  budget: SidebarPanelBudget,
  warnings: SidebarPanelWarning[],
): SidebarPanelSection | undefined {
  const activity = snapshot.recentActivity;
  if (!activity) {
    return density === "compact"
      ? undefined
      : createSidebarPanelSection({
          id: "activity",
          title: "Recent activity",
          lines: [line("none", "info")],
        });
  }
  const events = activity.events.slice(0, budget.maxActivityItems);
  if (events.length === 0 && density === "compact") {
    return undefined;
  }
  if (activity.events.length > events.length || activity.droppedEventCount > 0) {
    warnings.push({
      id: "activity-budget",
      severity: "warning",
      message: "Recent activity was trimmed to fit the panel budget.",
    });
  }
  const lines = events.length > 0
    ? events.map((event) => {
        const time = event.timestamp ? `${event.timestamp} ` : "";
        return line(
          `${time}${event.title}: ${event.summary}`,
          event.severity,
          event.id,
        );
      })
    : [line("none", "info")];
  if (activity.droppedEventCount > 0) {
    lines.push(line(`${activity.droppedEventCount} older events hidden by budget.`, "warning"));
  }
  return createSidebarPanelSection({
    id: "activity",
    title: "Recent activity",
    lines,
    severity: highestSeverity(lines.map((item) => item.severity)),
  });
}

function blockersSection(
  snapshot: SidebarStateSnapshot,
  density: SidebarPanelDensity,
): SidebarPanelSection | undefined {
  if (snapshot.notices.length === 0 && density === "compact") {
    return undefined;
  }
  const maxNotices = density === "detail" ? 8 : 5;
  const notices = snapshot.notices.slice(0, maxNotices);
  const lines = notices.length > 0
    ? notices.map((notice) => line(`${notice.severity}: ${notice.message}`, notice.severity, notice.id))
    : [line("none", "info")];
  if (snapshot.notices.length > notices.length) {
    lines.push(line(`${snapshot.notices.length - notices.length} more warnings hidden by budget.`, "warning"));
  }
  return createSidebarPanelSection({
    id: "blockers",
    title: "Blockers",
    lines,
    severity: highestSeverity(lines.map((item) => item.severity)),
  });
}

function nextActionSection(snapshot: SidebarStateSnapshot): SidebarPanelSection {
  const action = snapshot.recentActivity?.latestNextAction ??
    snapshot.nextActions[0]?.summary ??
    "Continue with the route-specific next step.";
  return createSidebarPanelSection({
    id: "next-action",
    title: "Next",
    lines: [line(action, "info", snapshot.nextActions[0]?.id)],
  });
}

function footerSection(snapshot: SidebarStateSnapshot): SidebarPanelSection {
  return createSidebarPanelSection({
    id: "footer",
    title: "Boundary",
    lines: [
      line("No provider/model calls, state mutation, dynamic discovery, or automatic injection. Session history may retain this report.", "info"),
      line(`Redactions: ${snapshot.redactions.length > 0 ? snapshot.redactions.join(", ") : "none"}`, "info"),
    ],
  });
}

function formatFacts(
  facts: readonly SidebarFact[],
  totalFactCount: number,
): SidebarPanelLine[] {
  const lines = facts.length > 0
    ? facts.map((fact) => line(`${fact.label}: ${fact.summary}`, fact.severity, fact.id))
    : [line("No visible facts supplied.", "info")];
  if (totalFactCount > facts.length) {
    lines.push(line(`${totalFactCount - facts.length} more facts hidden by budget.`, "info"));
  }
  return lines;
}

function enforceSectionBudget(
  sections: readonly SidebarPanelSection[],
  budget: SidebarPanelBudget,
  warnings: SidebarPanelWarning[],
): readonly SidebarPanelSection[] {
  if (sections.length <= budget.maxSections) {
    return sections;
  }
  const protectedSections = sections.filter((section) => PROTECTED_SECTIONS.has(section.id));
  const optionalBudget = Math.max(0, budget.maxSections - protectedSections.length);
  const selectedOptional = sections
    .filter((section) => !PROTECTED_SECTIONS.has(section.id))
    .slice(0, optionalBudget);
  warnings.push({
    id: "section-budget",
    severity: "warning",
    message: "Sidebar panel sections were trimmed to fit the section budget.",
  });
  const selectedIds = new Set([...protectedSections, ...selectedOptional].map((section) => section.id));
  return sections.filter((section) => selectedIds.has(section.id));
}

function isNoisyMissingFact(fact: SidebarFact): boolean {
  return (
    fact.summary.startsWith("No ") ||
    fact.summary.includes("not supplied") ||
    fact.summary.includes("Not discovered in this read-only preview") ||
    fact.summary.includes("unknown/deferred")
  );
}

function line(
  text: string,
  severity: SidebarSeverity,
  sourceId?: string,
): SidebarPanelLine {
  return { text: sanitizePanelText(text), severity, sourceId };
}

function highestSeverity(values: readonly SidebarSeverity[]): SidebarSeverity {
  const order: SidebarSeverity[] = ["info", "success", "warning", "blocked", "error"];
  return values.reduce(
    (highest, value) =>
      order.indexOf(value) > order.indexOf(highest) ? value : highest,
    "info" as SidebarSeverity,
  );
}
