import { sanitizeBrowserText } from "./browserCapabilityModel.js";
import { sanitizeBrowserEvidenceText } from "./browserLocalFixture.js";

export interface BrowserExecutionEvidenceRedactionInput {
  readonly actionId: string;
  readonly executionMode: string;
  readonly runtimeName: string;
  readonly target?: string;
  readonly safeTitle?: string;
  readonly safeUrl?: string;
  readonly safeSummary?: string;
  readonly actionTrace?: readonly string[];
  readonly rawContent?: string;
  readonly warnings?: readonly string[];
}

export interface BrowserRedactedExecutionEvidence {
  readonly actionId: string;
  readonly executionMode: string;
  readonly runtimeName: string;
  readonly target: string;
  readonly safeTitle: string;
  readonly safeUrl: string;
  readonly safeSummary: string;
  readonly actionTraceSummary: string;
  readonly executed: "yes" | "no";
  readonly warnings: readonly string[];
  readonly redactions: readonly string[];
}

export function redactBrowserExecutionEvidence(
  input: BrowserExecutionEvidenceRedactionInput & { readonly executed: boolean },
): BrowserRedactedExecutionEvidence {
  const summary = sanitizeBrowserEvidenceText(
    input.safeSummary ?? input.rawContent ?? "No page summary supplied.",
    180,
  );
  const trace = sanitizeBrowserEvidenceText(
    (input.actionTrace ?? []).join(" | ") || "No action trace supplied.",
    160,
  );
  const title = sanitizeBrowserEvidenceText(input.safeTitle ?? "untitled", 80);
  const url = sanitizeBrowserEvidenceText(input.safeUrl ?? input.target ?? "local-fixture://unknown", 120);
  const redactions = Array.from(
    new Set([
      ...summary.redactions,
      ...trace.redactions,
      ...title.redactions,
      ...url.redactions,
      ...(input.rawContent ? ["raw-content-bounded-summary"] : []),
    ]),
  );
  return {
    actionId: sanitizeBrowserText(input.actionId, 100),
    executionMode: sanitizeBrowserText(input.executionMode, 40),
    runtimeName: sanitizeBrowserText(input.runtimeName, 80),
    target: sanitizeBrowserText(input.target ?? input.safeUrl ?? "local-fixture", 120),
    safeTitle: title.value,
    safeUrl: url.value,
    safeSummary: summary.value,
    actionTraceSummary: trace.value,
    executed: input.executed ? "yes" : "no",
    warnings: Array.from(new Set([...(input.warnings ?? []), ...summary.warnings, ...trace.warnings])),
    redactions,
  };
}
