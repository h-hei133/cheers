import { sanitizeSidebarText } from "../presentation/sidebar/sidebarStateModel.js";

export type BrowserBackendKind =
  | "none"
  | "planned-playwright-cli"
  | "planned-browser-tool-server"
  | "planned-action-layer"
  | "external";

export type BrowserCapabilityStatus =
  | "unavailable"
  | "available-placeholder"
  | "preview-only"
  | "blocked"
  | "future";

export type BrowserActionKind =
  | "status"
  | "navigate"
  | "click"
  | "type"
  | "extract"
  | "observe"
  | "wait"
  | "screenshot"
  | "download"
  | "upload"
  | "auth"
  | "payment"
  | "destructive";

export type BrowserActionRisk =
  | "read-only"
  | "state-changing"
  | "sensitive"
  | "destructive"
  | "unsupported";

export interface BrowserCapabilityBoundary {
  readonly previewOnly: true;
  readonly browserExecution: false;
  readonly playwrightLaunch: false;
  readonly mcpLaunch: false;
  readonly dynamicDiscovery: false;
  readonly providerCall: "none";
  readonly modelCall: "none";
  readonly browserSessionPersistence: "none";
  readonly rawContent: "excluded";
}

export interface BrowserBackendCandidate {
  readonly kind: BrowserBackendKind;
  readonly label: string;
  readonly status: BrowserCapabilityStatus;
  readonly summary: string;
}

export interface BrowserCapabilityState {
  readonly status: BrowserCapabilityStatus;
  readonly activeBackend: BrowserBackendKind;
  readonly backendCandidates: readonly BrowserBackendCandidate[];
  readonly supportedPreviewActions: readonly BrowserActionKind[];
  readonly blockedActions: readonly BrowserActionKind[];
  readonly boundary: BrowserCapabilityBoundary;
  readonly evidence: readonly string[];
}

export function createBrowserCapabilityState(
  input: Partial<Omit<BrowserCapabilityState, "boundary" | "evidence">> & {
    readonly evidence?: readonly string[];
  } = {},
): BrowserCapabilityState {
  return {
    status: input.status ?? "preview-only",
    activeBackend: input.activeBackend ?? "none",
    backendCandidates: input.backendCandidates ?? defaultBackendCandidates(),
    supportedPreviewActions: input.supportedPreviewActions ?? [
      "navigate",
      "click",
      "type",
      "extract",
      "observe",
      "wait",
    ],
    blockedActions: input.blockedActions ?? [
      "screenshot",
      "download",
      "upload",
      "auth",
      "payment",
      "destructive",
    ],
    boundary: {
      previewOnly: true,
      browserExecution: false,
      playwrightLaunch: false,
      mcpLaunch: false,
      dynamicDiscovery: false,
      providerCall: "none",
      modelCall: "none",
      browserSessionPersistence: "none",
      rawContent: "excluded",
    },
    evidence: unique([
      ...(input.evidence ?? []),
      "browser-capability-model:pure",
      "browser-capability-model:preview-only",
      "browser-capability-model:no-browser-execution",
      "browser-capability-model:no-provider-or-model-call",
      "browser-capability-model:no-persistence",
      "browser-capability-model:no-dynamic-discovery",
    ]),
  };
}

export function browserActionRiskForKind(kind: BrowserActionKind): BrowserActionRisk {
  switch (kind) {
    case "status":
    case "extract":
    case "observe":
      return "read-only";
    case "navigate":
    case "click":
    case "type":
    case "wait":
      return "state-changing";
    case "auth":
    case "payment":
      return "sensitive";
    case "destructive":
      return "destructive";
    case "screenshot":
    case "download":
    case "upload":
      return "unsupported";
  }
}

export function sanitizeBrowserText(value: string, maxLength = 280): string {
  return sanitizeSidebarText(value, new Set(), maxLength);
}

function defaultBackendCandidates(): readonly BrowserBackendCandidate[] {
  return [
    {
      kind: "planned-playwright-cli",
      label: "Playwright CLI/Skills",
      status: "future",
      summary: "Deterministic browser automation candidate; not wired by default.",
    },
    {
      kind: "planned-browser-tool-server",
      label: "browser tool server",
      status: "future",
      summary: "Tool-server candidate with explicit capability list; no tool-server launch or discovery here.",
    },
    {
      kind: "planned-action-layer",
      label: "action-layer split",
      status: "future",
      summary: "Future deterministic action cache plus optional AI planning boundary; no model call here.",
    },
  ];
}

function unique(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}
