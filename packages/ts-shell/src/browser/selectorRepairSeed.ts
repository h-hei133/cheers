import { sanitizeBrowserText } from "./capabilityModel.js";
import type { BrowserAccessibilitySnapshot } from "./accessibilitySnapshot.js";
import type { BrowserActionTarget } from "./actionTarget.js";

export type BrowserSelectorRepairReadiness = "not-needed" | "preview-ready" | "blocked-no-candidates" | "blocked-sensitive";

export interface BrowserSelectorRepairSeed {
  readonly readiness: BrowserSelectorRepairReadiness;
  readonly reason: string;
  readonly requestedTargetId?: string;
  readonly candidateTargetIds: readonly string[];
  readonly previewSummary: string;
  readonly automaticExecution: false;
  readonly warnings: readonly string[];
  readonly evidence: readonly string[];
}

export function createBrowserSelectorRepairSeed(input: {
  readonly target?: BrowserActionTarget;
  readonly accessibilitySnapshot?: BrowserAccessibilitySnapshot;
}): BrowserSelectorRepairSeed {
  if (input.target && input.target.confidence >= 0.5 && input.target.riskLevel === "safe-controlled") {
    return seed("not-needed", "Action target is sufficiently confident.", {
      requestedTargetId: input.target.targetId,
      candidates: [],
    });
  }
  if (input.target?.riskLevel === "sensitive") {
    return seed("blocked-sensitive", "Sensitive target is not repairable in this route.", {
      requestedTargetId: input.target.targetId,
      candidates: [],
      warnings: ["selector-repair-sensitive-target"],
    });
  }
  const candidates = (input.accessibilitySnapshot?.candidateActionTargets ?? [])
    .filter((candidate) => !candidate.sensitive && !candidate.disabled && !candidate.hidden)
    .slice(0, 5)
    .map((candidate) => `${candidate.role}:${candidate.name}`);
  if (candidates.length === 0) {
    return seed("blocked-no-candidates", "No safe accessibility candidates were available for repair.", {
      requestedTargetId: input.target?.targetId,
      candidates,
      warnings: ["selector-repair-no-candidates"],
    });
  }
  return seed("preview-ready", "Selector repair preview is available from accessibility candidates.", {
    requestedTargetId: input.target?.targetId,
    candidates,
    warnings: ["selector-repair-preview-only"],
  });
}

function seed(
  readiness: BrowserSelectorRepairReadiness,
  reason: string,
  input: {
    readonly requestedTargetId?: string;
    readonly candidates: readonly string[];
    readonly warnings?: readonly string[];
  },
): BrowserSelectorRepairSeed {
  return {
    readiness,
    reason: sanitizeBrowserText(reason, 220),
    requestedTargetId: input.requestedTargetId,
    candidateTargetIds: input.candidates.map((candidate) => sanitizeBrowserText(candidate, 120)),
    previewSummary: input.candidates.length > 0
      ? input.candidates.map((candidate) => sanitizeBrowserText(candidate, 80)).join("; ")
      : "none",
    automaticExecution: false,
    warnings: input.warnings ?? [],
    evidence: [
      `browser-selector-repair-seed:${readiness}`,
      "browser-selector-repair-seed:preview-only",
      "browser-selector-repair-seed:no-automatic-repair",
    ],
  };
}
