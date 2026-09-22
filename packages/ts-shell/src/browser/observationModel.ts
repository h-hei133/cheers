import { sanitizeBrowserText } from "./capabilityModel.js";
import type { BrowserAccessibilitySnapshot } from "./accessibilitySnapshot.js";
import { browserDomSnapshotTextSummary, type BrowserDomSnapshot } from "./domSnapshot.js";
import type { BrowserObservationProvenance } from "./observationProvenance.js";

export interface BrowserObservation {
  readonly observationId: string;
  readonly runtimeStatus: string;
  readonly urlSummary: string;
  readonly originSummary: string;
  readonly domSnapshot?: BrowserDomSnapshot;
  readonly accessibilitySnapshot?: BrowserAccessibilitySnapshot;
  readonly textSummary: string;
  readonly linkSummary: readonly string[];
  readonly interactiveSummary: readonly string[];
  readonly evidenceSource: string;
  readonly provenance: BrowserObservationProvenance;
  readonly redactions: readonly string[];
  readonly warnings: readonly string[];
  readonly rawContent: "excluded";
  readonly hiddenReasoning: "excluded";
}

export function createBrowserObservation(input: {
  readonly observationId: string;
  readonly runtimeStatus: string;
  readonly urlSummary: string;
  readonly originSummary: string;
  readonly domSnapshot?: BrowserDomSnapshot;
  readonly accessibilitySnapshot?: BrowserAccessibilitySnapshot;
  readonly evidenceSource: string;
  readonly provenance: BrowserObservationProvenance;
  readonly renderedText?: string;
  readonly warnings?: readonly string[];
  readonly redactions?: readonly string[];
}): BrowserObservation {
  const textParts = [
    input.renderedText,
    input.domSnapshot ? browserDomSnapshotTextSummary(input.domSnapshot) : undefined,
    ...(input.accessibilitySnapshot?.roleTreeSummary ?? []),
  ];
  const linkSummary = input.domSnapshot?.links.map((link) => link.label) ?? [];
  const interactiveSummary = input.accessibilitySnapshot?.interactiveElements
    .map((element) => `${element.role}:${element.name}`)
    .slice(0, 16) ?? [];
  return {
    observationId: sanitizeId(input.observationId),
    runtimeStatus: sanitizeBrowserText(input.runtimeStatus, 80),
    urlSummary: sanitizeBrowserText(input.urlSummary, 180),
    originSummary: sanitizeBrowserText(input.originSummary, 120),
    domSnapshot: input.domSnapshot,
    accessibilitySnapshot: input.accessibilitySnapshot,
    textSummary: sanitizeBrowserText(textParts.filter(Boolean).join(" | "), 1200),
    linkSummary: linkSummary.map((link) => sanitizeBrowserText(link, 180)).slice(0, 12),
    interactiveSummary,
    evidenceSource: sanitizeBrowserText(input.evidenceSource, 120),
    provenance: input.provenance,
    redactions: unique([
      ...(input.redactions ?? []),
      ...(input.domSnapshot?.redactions ?? []),
      ...(input.accessibilitySnapshot?.redactions ?? []),
    ]),
    warnings: unique([
      ...(input.warnings ?? []),
      ...(input.domSnapshot?.warnings ?? []),
      ...(input.accessibilitySnapshot?.warnings ?? []),
    ]),
    rawContent: "excluded",
    hiddenReasoning: "excluded",
  };
}

function sanitizeId(value: string): string {
  return sanitizeBrowserText(value, 140)
    .toLowerCase()
    .replace(/[^a-z0-9:._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "browser-observation";
}

function unique(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0))).sort();
}
