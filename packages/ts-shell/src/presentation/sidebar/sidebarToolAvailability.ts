import type { SidebarFact } from "./sidebarStateModel.js";

export type SidebarAvailabilityStatus =
  | "available"
  | "unavailable"
  | "unknown"
  | "deferred";

export type SidebarToolAvailabilityCategory =
  | "local-command"
  | "mcp-server"
  | "skill"
  | "browser-tooling";

export interface SidebarToolAvailabilityItemInput {
  readonly id: string;
  readonly label?: string;
  readonly status?: SidebarAvailabilityStatus;
  readonly summary?: string;
  readonly evidence?: readonly string[];
}

export interface SidebarToolAvailabilityInput {
  readonly localCommands?: readonly SidebarToolAvailabilityItemInput[];
  readonly mcpServers?: readonly SidebarToolAvailabilityItemInput[];
  readonly skills?: readonly SidebarToolAvailabilityItemInput[];
  readonly browserTooling?: readonly SidebarToolAvailabilityItemInput[];
}

export interface SidebarToolAvailabilityItem {
  readonly id: string;
  readonly category: SidebarToolAvailabilityCategory;
  readonly label: string;
  readonly status: SidebarAvailabilityStatus;
  readonly summary: string;
  readonly evidence: readonly string[];
}

export interface SidebarToolAvailabilitySummary {
  readonly items: readonly SidebarToolAvailabilityItem[];
  readonly discovery: "not-run";
  readonly providerCall: "none";
  readonly mcpCall: "none";
  readonly packageScriptExecution: "none";
  readonly evidence: readonly string[];
}

export function normalizeSidebarToolAvailability(
  input: SidebarToolAvailabilityInput = {},
): SidebarToolAvailabilitySummary {
  const items = [
    ...normalizeCategory("local-command", input.localCommands),
    ...normalizeCategory("mcp-server", input.mcpServers),
    ...normalizeCategory("skill", input.skills),
    ...normalizeCategory("browser-tooling", input.browserTooling),
  ];
  return {
    items,
    discovery: "not-run",
    providerCall: "none",
    mcpCall: "none",
    packageScriptExecution: "none",
    evidence: [
      "sidebar-tool-availability:explicit-input-only",
      "sidebar-tool-availability:no-discovery",
      "sidebar-tool-availability:no-provider-call",
      "sidebar-tool-availability:no-mcp-call",
      "sidebar-tool-availability:no-package-script-execution",
    ],
  };
}

export function sidebarToolAvailabilityFacts(
  summary: SidebarToolAvailabilitySummary,
): readonly SidebarFact[] {
  const facts = summary.items.map((item) => ({
    id: `tool-availability:${item.category}:${item.id}`,
    section: "tools" as const,
    severity: severityForStatus(item.status),
    kind: item.status === "available" ? "status" as const : "warning" as const,
    visibility: "user-visible" as const,
    source: "tool-availability" as const,
    label: item.label,
    summary: `${formatCategory(item.category)}: ${item.status} - ${item.summary}`,
    evidence: item.evidence,
  }));
  return facts.length > 0
    ? facts
    : [{
        id: "tool-availability:deferred",
        section: "tools",
        severity: "info",
        kind: "status",
        visibility: "user-visible",
        source: "tool-availability",
        label: "Discovery not run",
        summary: "Tool, MCP, skill, and browser availability are unknown/deferred because this preview does not discover them.",
        evidence: summary.evidence,
      }];
}

function normalizeCategory(
  category: SidebarToolAvailabilityCategory,
  values: readonly SidebarToolAvailabilityItemInput[] | undefined,
): readonly SidebarToolAvailabilityItem[] {
  if (!values || values.length === 0) {
    return [{
      id: `${category}:deferred`,
      category,
      label: formatCategory(category),
      status: "deferred",
      summary: "Not discovered in this read-only preview.",
      evidence: ["sidebar-tool-availability:category-deferred"],
    }];
  }
  return values.map((value) => ({
    id: normalizeId(value.id),
    category,
    label: value.label?.trim() || value.id,
    status: value.status ?? "unknown",
    summary: value.summary?.replace(/\s+/g, " ").trim() || "Explicit availability input has no detail.",
    evidence: [...(value.evidence ?? []), "sidebar-tool-availability:explicit-input"],
  }));
}

function severityForStatus(status: SidebarAvailabilityStatus): SidebarFact["severity"] {
  if (status === "available") {
    return "success";
  }
  if (status === "unavailable") {
    return "warning";
  }
  return "info";
}

function formatCategory(category: SidebarToolAvailabilityCategory): string {
  switch (category) {
    case "local-command":
      return "Local commands";
    case "mcp-server":
      return "MCP servers";
    case "skill":
      return "Skills";
    case "browser-tooling":
      return "Browser tooling";
  }
}

function normalizeId(value: string): string {
  return value.replace(/\s+/g, "-").replace(/[^A-Za-z0-9:._-]/g, "").trim() || "unknown";
}
