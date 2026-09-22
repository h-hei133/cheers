import type { BrowserExecutorResult } from "./executor.js";
import type { BrowserExecutionRequest } from "./executionContract.js";

export interface BrowserExecutionEvidencePolicy {
  readonly requiredEvidence: readonly string[];
  readonly fakeEvidence: boolean;
  readonly rawContentAllowed: false;
  readonly screenshotAllowed: false;
  readonly ocrAllowed: false;
  readonly evidence: readonly string[];
}

export function buildBrowserExecutionEvidencePolicy(input: {
  readonly request: BrowserExecutionRequest;
  readonly executorResult?: BrowserExecutorResult;
}): BrowserExecutionEvidencePolicy {
  return {
    requiredEvidence: requiredEvidenceForAction(input.request),
    fakeEvidence: input.executorResult?.executorKind === "fake-test" || input.request.mode === "fake-test",
    rawContentAllowed: false,
    screenshotAllowed: false,
    ocrAllowed: false,
    evidence: [
      "browser-execution-evidence-policy:deterministic",
      "browser-execution-evidence-policy:no-raw-content",
      "browser-execution-evidence-policy:no-screenshot-or-ocr",
      input.executorResult?.executorKind === "fake-test" || input.request.mode === "fake-test"
        ? "browser-execution-evidence-policy:fake-test"
        : "browser-execution-evidence-policy:planned-real-evidence-only",
    ],
  };
}

function requiredEvidenceForAction(
  request: BrowserExecutionRequest,
): readonly string[] {
  const base = [
    "action request id",
    "runtime/backend",
    "sandbox decision",
    "confirmation decision",
    "redactions",
    "executed yes/no",
  ];
  if (request.actionKind === "navigate") {
    return [
      ...base,
      "target URL/origin",
      "allowlist decision",
      "accessibility snapshot summary reference",
    ];
  }
  if (request.actionKind === "observe") {
    return [...base, "accessibility snapshot summary reference", "selected element evidence"];
  }
  if (request.actionKind === "extract") {
    return [...base, "extraction schema/result summary", "source selector summary"];
  }
  return [...base, "blocked action reason", "action trace summary"];
}
