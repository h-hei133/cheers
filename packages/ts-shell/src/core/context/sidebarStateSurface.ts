import type { SidebarSection, SidebarStateSnapshot } from "./sidebarStateModel.js";
import { sidebarFactsForSection } from "./sidebarStateModel.js";

const SECTION_ORDER: ReadonlyArray<{ readonly id: SidebarSection; readonly title: string }> = [
  { id: "task-route", title: "Task / route" },
  { id: "edit", title: "Edit" },
  { id: "compact", title: "Compact" },
  { id: "memory", title: "Memory" },
  { id: "warmup", title: "Warmup" },
  { id: "validation", title: "Validation" },
  { id: "tools", title: "Tools / MCP / Skills" },
  { id: "blockers", title: "Blockers / warnings" },
  { id: "next-action", title: "Next action" },
];

export interface RenderSidebarStateSurfaceOptions {
  readonly maxFactsPerSection?: number;
}

export function renderSidebarStateSurface(
  snapshot: SidebarStateSnapshot,
  options: RenderSidebarStateSurfaceOptions = {},
): string {
  const maxFactsPerSection = options.maxFactsPerSection ?? 4;
  const lines = [
    "Visible agent state",
    "State preview only: no actual sidebar UI exists yet.",
    "Read-only: no provider/model call, no dynamic MCP/skills discovery, no persistence, no automatic memory/startup injection.",
    "Tool discovery not run: unknown/deferred entries are placeholders.",
    "",
  ];

  for (const section of SECTION_ORDER) {
    if (section.id === "blockers") {
      lines.push(section.title);
      if (snapshot.notices.length === 0) {
        lines.push("- none");
      } else {
        for (const notice of snapshot.notices.slice(0, maxFactsPerSection)) {
          lines.push(`- ${notice.severity}: ${notice.message}`);
        }
        if (snapshot.notices.length > maxFactsPerSection) {
          lines.push(`- ... ${snapshot.notices.length - maxFactsPerSection} more`);
        }
      }
      lines.push("");
      continue;
    }
    if (section.id === "next-action") {
      lines.push(section.title);
      for (const action of snapshot.nextActions.slice(0, Math.max(1, maxFactsPerSection))) {
        lines.push(`- ${action.summary}`);
      }
      if (snapshot.nextActions.length === 0) {
        lines.push("- Continue with the route-specific next step.");
      }
      lines.push("");
      continue;
    }
    const facts = sidebarFactsForSection(snapshot, section.id).slice(0, maxFactsPerSection);
    lines.push(section.title);
    if (facts.length === 0) {
      lines.push("- no visible facts");
    } else {
      for (const fact of facts) {
        lines.push(`- ${fact.label}: ${fact.summary}`);
      }
      const total = sidebarFactsForSection(snapshot, section.id).length;
      if (total > maxFactsPerSection) {
        lines.push(`- ... ${total - maxFactsPerSection} more`);
      }
    }
    lines.push("");
  }

  lines.push("Safety");
  lines.push("- Raw content/secrets/hidden reasoning: excluded");
  lines.push(`- Redactions: ${snapshot.redactions.length > 0 ? snapshot.redactions.join(", ") : "none"}`);

  return lines.join("\n").trimEnd();
}
