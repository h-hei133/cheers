import { sanitizeBrowserText } from "./capabilityModel.js";
import type { BrowserExecutionRequest } from "./executionContract.js";
import type { BrowserExecutorResult } from "./executor.js";
import {
  classifyBrowserEvidenceSafety,
  type BrowserEvidenceSafetyResult,
} from "./evidenceSafety.js";

export type BrowserEvidenceVisibility = "user-visible" | "developer-only" | "hidden";

export interface BrowserEvidenceReference {
  readonly kind:
    | "safe-summary"
    | "accessibility-snapshot-summary"
    | "runner-metadata"
    | "stdout-stderr-summary"
    | "action-trace"
    | "dry-run-plan"
    | "unavailable-runtime";
  readonly label: string;
  readonly visibility: BrowserEvidenceVisibility;
}

export interface BrowserEvidenceBundle {
  readonly bundleId: string;
  readonly safeTitle: string;
  readonly safeUrl: string;
  readonly safeOriginOrFixtureId: string;
  readonly observationSummary: string;
  readonly extractionSummary: string;
  readonly actionTraceSummary: string;
  readonly stdoutStderrSummary: string;
  readonly responseMetadataSummary: string;
  readonly evidenceReferences: readonly BrowserEvidenceReference[];
  readonly redactions: readonly string[];
  readonly warnings: readonly string[];
  readonly visibilityLabels: readonly BrowserEvidenceVisibility[];
  readonly safety: BrowserEvidenceSafetyResult;
  readonly rawContent: "excluded";
}

export function createBrowserEvidenceBundle(input: {
  readonly request: BrowserExecutionRequest;
  readonly executorResult: BrowserExecutorResult;
  readonly outputBudgetBytes?: number;
}): BrowserEvidenceBundle {
  const evidenceValues = input.executorResult.evidence.map((item) => item.value);
  const safeUrl = evidenceValue(input.executorResult, "safe url") ?? safeUrlForRequest(input.request);
  const fixtureId = evidenceValue(input.executorResult, "fixture id") ?? fixtureIdForRequest(input.request);
  const stdoutSummary = evidenceValue(input.executorResult, "stdout summary") ?? "none";
  const stderrSummary = evidenceValue(input.executorResult, "stderr summary") ?? "none";
  const safety = classifyBrowserEvidenceSafety({
    values: [
      ...evidenceValues,
      ...input.executorResult.warnings,
      input.executorResult.error?.message ?? "",
      safeUrl,
    ],
    outputBudgetBytes: input.outputBudgetBytes,
    externalUrlEvidence: isExternalUrl(safeUrl),
  });
  const observationSummary = safeSummary(
    evidenceValue(input.executorResult, "safe observation") ??
      evidenceValue(input.executorResult, "observation summary") ??
      "none",
  );
  const extractionSummary = safeSummary(
    evidenceValue(input.executorResult, "safe extraction") ??
      evidenceValue(input.executorResult, "extraction summary") ??
      "none",
  );
  const actionTraceSummary = safeSummary(
    evidenceValue(input.executorResult, "action trace") ??
      `${input.request.actionKind}:${input.executorResult.status}`,
  );

  return {
    bundleId: deterministicBrowserEvidenceBundleId(input.request.requestId, input.executorResult.status),
    safeTitle: safeSummary(evidenceValue(input.executorResult, "safe title") ?? titleForRequest(input.request)),
    safeUrl: isExternalUrl(safeUrl) ? "external-url:redacted" : safeSummary(safeUrl, 120),
    safeOriginOrFixtureId: safeSummary(fixtureId, 120),
    observationSummary,
    extractionSummary,
    actionTraceSummary,
    stdoutStderrSummary: safeSummary(
      `stdout=${stdoutSummary}; stderr=${stderrSummary}`,
      220,
    ),
    responseMetadataSummary: safeSummary(responseMetadata(input.executorResult), 220),
    evidenceReferences: evidenceReferencesFor(input.executorResult, input.request),
    redactions: unique([
      ...input.executorResult.evidence
        .filter((item) => item.label === "redaction")
        .map((item) => safeSummary(item.value, 80)),
      ...input.executorResult.warnings
        .filter((warning) => /redact|raw/i.test(warning))
        .map((warning) => safeSummary(warning, 80)),
      ...input.executorResult.evidence
        .filter((item) => item.label === "raw content" && item.value === "excluded")
        .map(() => "raw-content"),
      ...safety.redactions,
    ]),
    warnings: unique([
      ...input.executorResult.warnings.map((warning) => safeSummary(warning, 120)),
      ...safety.warnings,
      ...safety.blockers.map((blocker) => `blocked:${blocker}`),
    ]),
    visibilityLabels: ["user-visible", "developer-only", "hidden"],
    safety,
    rawContent: "excluded",
  };
}

export function deterministicBrowserEvidenceBundleId(
  requestId: string,
  status: string,
): string {
  const normalized = sanitizeBrowserText(`${requestId}:${status}`, 120)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `browser-evidence:${normalized || "bundle"}`;
}

function evidenceValue(result: BrowserExecutorResult, label: string): string | undefined {
  return result.evidence.find((item) => item.label === label)?.value;
}

function evidenceReferencesFor(
  result: BrowserExecutorResult,
  request: BrowserExecutionRequest,
): readonly BrowserEvidenceReference[] {
  const references: BrowserEvidenceReference[] = [
    { kind: "safe-summary", label: "safe summary", visibility: "user-visible" },
    { kind: "runner-metadata", label: result.executorKind, visibility: "developer-only" },
  ];
  if (result.evidence.some((item) => /observation|safe title|safe url/i.test(item.label))) {
    references.push({
      kind: "accessibility-snapshot-summary",
      label: "snapshot summary only",
      visibility: "developer-only",
    });
  }
  if (result.evidence.some((item) => /stdout|stderr/i.test(item.label))) {
    references.push({
      kind: "stdout-stderr-summary",
      label: "runner output summary only",
      visibility: "developer-only",
    });
  }
  if (result.evidence.some((item) => /action trace/i.test(item.label))) {
    references.push({ kind: "action-trace", label: request.actionKind, visibility: "developer-only" });
  }
  if (!result.executed) {
    references.push({ kind: "unavailable-runtime", label: result.status, visibility: "developer-only" });
  }
  return references;
}

function responseMetadata(result: BrowserExecutorResult): string {
  return [
    `executor=${result.executorKind}`,
    `status=${result.status}`,
    `executed=${result.executed ? "yes" : "no"}`,
    `provider=${result.providerCall}`,
    `model=${result.modelCall}`,
    `persistence=${result.browserSessionPersistence}`,
  ].join("; ");
}

function safeUrlForRequest(request: BrowserExecutionRequest): string {
  return request.action.url ?? "local-fixture://current-page";
}

function fixtureIdForRequest(request: BrowserExecutionRequest): string {
  const url = request.action.url;
  if (url?.startsWith("local-fixture://")) {
    return url.replace("local-fixture://", "fixture:");
  }
  return "fixture:unknown";
}

function titleForRequest(request: BrowserExecutionRequest): string {
  return request.action.target ?? request.action.extractionGoal ?? request.actionKind;
}

function isExternalUrl(value: string): boolean {
  return /^https?:\/\//i.test(value) && !/^https?:\/\/(?:localhost|127\.0\.0\.1)(?:[:/]|$)/i.test(value);
}

function safeSummary(value: string, maxLength = 180): string {
  const safety = classifyBrowserEvidenceSafety({ values: [value] });
  if (safety.blockers.length > 0) {
    return `[redacted:${safety.redactions[0] ?? "unsafe-evidence"}]`;
  }
  return sanitizeBrowserText(value.replace(/\s+/g, " "), maxLength);
}

function unique(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}
