import { sanitizeBrowserText } from "./capabilityModel.js";

export interface BrowserObservationProvenance {
  readonly provenanceId: string;
  readonly observationId: string;
  readonly runtimeId: string;
  readonly urlSummary: string;
  readonly originSummary: string;
  readonly actionKind: string;
  readonly domSnapshotId?: string;
  readonly accessibilitySnapshotId?: string;
  readonly timestamp: string;
  readonly evidenceVisibility: "safe-summary-only";
  readonly quoteSnippetBudget: number;
  readonly citationLabels: readonly string[];
  readonly rawContent: "excluded";
  readonly hiddenReasoning: "excluded";
}

export function createBrowserObservationProvenance(input: {
  readonly observationId: string;
  readonly runtimeId: string;
  readonly urlSummary: string;
  readonly originSummary: string;
  readonly actionKind: string;
  readonly domSnapshotId?: string;
  readonly accessibilitySnapshotId?: string;
  readonly timestamp?: string;
  readonly quoteSnippetBudget?: number;
}): BrowserObservationProvenance {
  const timestamp = input.timestamp ?? "2026-05-18T00:00:00.000Z";
  return {
    provenanceId: deterministicBrowserProvenanceId(input.observationId, input.actionKind),
    observationId: sanitizeBrowserText(input.observationId, 140),
    runtimeId: sanitizeBrowserText(input.runtimeId, 140),
    urlSummary: sanitizeBrowserText(input.urlSummary, 180),
    originSummary: sanitizeBrowserText(input.originSummary, 120),
    actionKind: sanitizeBrowserText(input.actionKind, 60),
    domSnapshotId: input.domSnapshotId,
    accessibilitySnapshotId: input.accessibilitySnapshotId,
    timestamp,
    evidenceVisibility: "safe-summary-only",
    quoteSnippetBudget: Math.max(80, Math.min(800, input.quoteSnippetBudget ?? 280)),
    citationLabels: [
      `browser-observation:${sanitizeBrowserText(input.observationId, 80)}`,
      ...(input.domSnapshotId ? [`dom:${sanitizeBrowserText(input.domSnapshotId, 80)}`] : []),
      ...(input.accessibilitySnapshotId ? [`accessibility:${sanitizeBrowserText(input.accessibilitySnapshotId, 80)}`] : []),
    ],
    rawContent: "excluded",
    hiddenReasoning: "excluded",
  };
}

function deterministicBrowserProvenanceId(observationId: string, actionKind: string): string {
  const normalized = sanitizeBrowserText(`${observationId}:${actionKind}`, 140)
    .toLowerCase()
    .replace(/[^a-z0-9:._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `browser-provenance:${normalized || "observation"}`;
}
