import type {
  SidebarSection,
  SidebarSeverity,
} from "./sidebarStateModel.js";

export const SIDEBAR_PANEL_MODEL_VERSION = "sidebar-panel-v1" as const;

export type SidebarPanelSectionId =
  | "header"
  | "live-frame"
  | SidebarSection
  | "activity"
  | "footer";

export type SidebarPanelDensity = "compact" | "normal" | "detail";
export type SidebarPanelRenderMode = "plain" | "ansi-safe";

export interface SidebarPanelBudget {
  readonly maxWidth: number;
  readonly maxSections: number;
  readonly maxActivityItems: number;
  readonly maxLines: number;
}

export interface SidebarPanelLine {
  readonly text: string;
  readonly severity: SidebarSeverity;
  readonly sourceId?: string;
}

export interface SidebarPanelSection {
  readonly id: SidebarPanelSectionId;
  readonly title: string;
  readonly lines: readonly SidebarPanelLine[];
  readonly severity: SidebarSeverity;
}

export interface SidebarPanelWarning {
  readonly id: string;
  readonly message: string;
  readonly severity: Extract<SidebarSeverity, "warning" | "blocked" | "error">;
}

export interface SidebarPanel {
  readonly panelVersion: typeof SIDEBAR_PANEL_MODEL_VERSION;
  readonly title: string;
  readonly density: SidebarPanelDensity;
  readonly renderMode: SidebarPanelRenderMode;
  readonly budget: SidebarPanelBudget;
  readonly sections: readonly SidebarPanelSection[];
  readonly warnings: readonly SidebarPanelWarning[];
  readonly safety: {
    readonly readOnly: true;
    readonly actualSidebarUi: false;
    readonly alwaysOnUi: false;
    readonly dynamicDiscovery: false;
    readonly providerCall: "none";
    readonly modelCall: "none";
    readonly persistence: "none";
    readonly rawContent: "excluded";
  };
  readonly evidence: readonly string[];
}

export function sidebarPanelBudgetForDensity(
  density: SidebarPanelDensity,
  override: Partial<SidebarPanelBudget> = {},
): SidebarPanelBudget {
  const base = density === "compact"
    ? { maxWidth: 64, maxSections: 8, maxActivityItems: 3, maxLines: 28 }
    : density === "detail"
      ? { maxWidth: 88, maxSections: 14, maxActivityItems: 8, maxLines: 64 }
      : { maxWidth: 76, maxSections: 12, maxActivityItems: 5, maxLines: 42 };
  return {
    maxWidth: clampInteger(override.maxWidth ?? base.maxWidth, 40, 120),
    maxSections: clampInteger(override.maxSections ?? base.maxSections, 4, 24),
    maxActivityItems: clampInteger(
      override.maxActivityItems ?? base.maxActivityItems,
      0,
      20,
    ),
    maxLines: clampInteger(override.maxLines ?? base.maxLines, 10, 120),
  };
}

export function createSidebarPanel(input: {
  readonly title?: string;
  readonly density?: SidebarPanelDensity;
  readonly renderMode?: SidebarPanelRenderMode;
  readonly budget?: Partial<SidebarPanelBudget>;
  readonly sections?: readonly SidebarPanelSection[];
  readonly warnings?: readonly SidebarPanelWarning[];
  readonly evidence?: readonly string[];
} = {}): SidebarPanel {
  const density = input.density ?? "normal";
  return {
    panelVersion: SIDEBAR_PANEL_MODEL_VERSION,
    title: sanitizePanelText(input.title ?? "Sidebar panel"),
    density,
    renderMode: input.renderMode ?? "plain",
    budget: sidebarPanelBudgetForDensity(density, input.budget),
    sections: input.sections ?? [],
    warnings: input.warnings ?? [],
    safety: {
      readOnly: true,
      actualSidebarUi: false,
      alwaysOnUi: false,
      dynamicDiscovery: false,
      providerCall: "none",
      modelCall: "none",
      persistence: "none",
      rawContent: "excluded",
    },
    evidence: unique([
      ...(input.evidence ?? []),
      "sidebar-panel-model:pure",
      "sidebar-panel-model:read-only",
      "sidebar-panel-model:no-persistence",
      "sidebar-panel-model:no-provider-or-model-call",
      "sidebar-panel-model:no-dynamic-discovery",
    ]),
  };
}

export function createSidebarPanelSection(input: {
  readonly id: SidebarPanelSectionId;
  readonly title: string;
  readonly lines?: readonly SidebarPanelLine[];
  readonly severity?: SidebarSeverity;
}): SidebarPanelSection {
  const lines = input.lines ?? [];
  return {
    id: input.id,
    title: sanitizePanelText(input.title, 80),
    lines: lines.map((line) => ({
      ...line,
      text: sanitizePanelText(line.text),
    })),
    severity: input.severity ?? highestSeverity(lines.map((line) => line.severity)),
  };
}

export function sanitizePanelText(value: string, maxLength = 320): string {
  let sanitized = value.replace(/\s+/g, " ").trim()
    .replace(/\b(sk-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g, "[REDACTED_SECRET]")
    .replace(/\b(api key|token|authorization|provider credential|provider config|secret)\b/gi, "[REDACTED_SECRET_LABEL]")
    .replace(/\bRAW_[A-Z0-9_]+\b/g, "[REDACTED_RAW]")
    .replace(/\braw (file|recovery|content|memory|event) content\b/gi, "[REDACTED_RAW_CONTENT]")
    .replace(/\b(hidden reasoning|chain[- ]?of[- ]?thought)\b/gi, "[REDACTED_REASONING]");
  if (sanitized.length > maxLength) {
    sanitized = `${sanitized.slice(0, Math.max(0, maxLength - 3))}...`;
  }
  return sanitized;
}

export function sidebarPanelTextHasForbiddenContent(value: string): boolean {
  return (
    /\b(sk-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/.test(value) ||
    /\bRAW_[A-Z0-9_]+\b/.test(value) ||
    /\b(hidden reasoning|chain[- ]?of[- ]?thought)\b/i.test(value)
  );
}

function highestSeverity(values: readonly SidebarSeverity[]): SidebarSeverity {
  const order: SidebarSeverity[] = ["info", "success", "warning", "blocked", "error"];
  return values.reduce(
    (highest, value) =>
      order.indexOf(value) > order.indexOf(highest) ? value : highest,
    "info" as SidebarSeverity,
  );
}

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function unique(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}
