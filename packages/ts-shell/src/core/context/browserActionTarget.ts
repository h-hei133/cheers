import { sanitizeBrowserText } from "./browserCapabilityModel.js";
import type { BrowserAccessibilitySnapshot, BrowserAccessibilityElement } from "./browserAccessibilitySnapshot.js";
import type { BrowserExecutionRequest } from "./browserExecutionContract.js";

export type BrowserRuntimeActionKind = "click" | "type";
export type BrowserActionTargetRiskLevel = "safe-controlled" | "needs-confirmation" | "sensitive" | "missing";

export interface BrowserActionTarget {
  readonly targetId: string;
  readonly actionKind: BrowserRuntimeActionKind;
  readonly selectorSummary: string;
  readonly accessibleRole?: string;
  readonly accessibleName?: string;
  readonly textLabelSummary: string;
  readonly confidence: number;
  readonly riskLevel: BrowserActionTargetRiskLevel;
  readonly requiresConfirmation: boolean;
  readonly provenanceSnapshotId: string;
}

export function createBrowserActionTarget(input: {
  readonly request: BrowserExecutionRequest;
  readonly accessibilitySnapshot?: BrowserAccessibilitySnapshot;
  readonly provenanceSnapshotId: string;
}): BrowserActionTarget {
  const actionKind = input.request.actionKind === "type" ? "type" : "click";
  const requested = input.request.action.target ?? input.request.action.selector ?? input.request.action.text ?? "";
  const candidate = bestCandidate(requested, input.accessibilitySnapshot?.interactiveElements ?? []);
  const sensitive = /password|payment|credit|card|token|secret|api[_ -]?key/i.test(requested) || candidate?.sensitive;
  const missing = !candidate && requested.trim().length > 0;
  return {
    targetId: deterministicTargetId(actionKind, requested || (candidate?.name ?? "missing")),
    actionKind,
    selectorSummary: sanitizeBrowserText(input.request.action.selector ?? candidate?.selectorSummary ?? requested, 100),
    accessibleRole: candidate?.role,
    accessibleName: candidate?.name,
    textLabelSummary: sanitizeBrowserText(candidate?.name ?? (requested || "missing target"), 140),
    confidence: candidate ? (exactLabelMatch(requested, candidate) ? 0.96 : 0.72) : 0.18,
    riskLevel: sensitive ? "sensitive" : missing ? "missing" : "safe-controlled",
    requiresConfirmation: actionKind === "type" || actionKind === "click",
    provenanceSnapshotId: sanitizeBrowserText(input.provenanceSnapshotId, 140),
  };
}

function bestCandidate(
  requested: string,
  candidates: readonly BrowserAccessibilityElement[],
): BrowserAccessibilityElement | undefined {
  const normalized = normalize(requested);
  if (!normalized) {
    return candidates[0];
  }
  return candidates.find((candidate) => exactLabelMatch(requested, candidate)) ??
    candidates.find((candidate) =>
      normalize(candidate.name).includes(normalized) ||
      normalized.includes(normalize(candidate.name)) ||
      normalize(candidate.selectorSummary).includes(normalized)
    );
}

function exactLabelMatch(requested: string, candidate: BrowserAccessibilityElement): boolean {
  return normalize(candidate.name) === normalize(requested) || normalize(candidate.selectorSummary) === normalize(requested);
}

function normalize(value: string): string {
  return sanitizeBrowserText(value, 160).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function deterministicTargetId(actionKind: string, target: string): string {
  const normalized = sanitizeBrowserText(`${actionKind}:${target}`, 120)
    .toLowerCase()
    .replace(/[^a-z0-9:._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `browser-target:${normalized || "target"}`;
}
