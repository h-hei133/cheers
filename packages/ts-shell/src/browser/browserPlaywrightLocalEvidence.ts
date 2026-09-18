import type { BrowserExecutionRequest } from "./browserExecutionContract.js";
import { redactBrowserExecutionEvidence } from "./browserExecutionEvidenceRedactor.js";
import type { BrowserLocalFixture } from "./browserLocalFixture.js";
import type { BrowserPlaywrightRuntimeKind } from "./browserPlaywrightAvailability.js";

export type BrowserPlaywrightLocalEvidenceMode =
  | "local-fixture"
  | "unavailable"
  | "blocked";

export interface BrowserPlaywrightLocalEvidenceInput {
  readonly executionId: string;
  readonly runtimeKind: BrowserPlaywrightRuntimeKind;
  readonly mode: BrowserPlaywrightLocalEvidenceMode;
  readonly fixture?: BrowserLocalFixture;
  readonly request: BrowserExecutionRequest;
  readonly safeObservationSummary?: string;
  readonly safeExtractionSummary?: string;
  readonly actionTrace?: readonly string[];
  readonly stdout?: string;
  readonly stderr?: string;
  readonly warnings?: readonly string[];
  readonly executed: boolean;
}

export interface BrowserPlaywrightLocalEvidence {
  readonly executionId: string;
  readonly runtimeKind: BrowserPlaywrightRuntimeKind;
  readonly mode: BrowserPlaywrightLocalEvidenceMode;
  readonly fixtureId: string;
  readonly safeUrl: string;
  readonly safeTitle: string;
  readonly actionKind: BrowserExecutionRequest["actionKind"];
  readonly safeObservationSummary: string;
  readonly safeExtractionSummary: string;
  readonly actionTraceSummary: string;
  readonly stdoutSummary: string;
  readonly stderrSummary: string;
  readonly redactions: readonly string[];
  readonly warnings: readonly string[];
  readonly executed: "yes" | "no";
}

export function buildBrowserPlaywrightLocalEvidence(
  input: BrowserPlaywrightLocalEvidenceInput,
): BrowserPlaywrightLocalEvidence {
  const summary = input.safeExtractionSummary ??
    input.safeObservationSummary ??
    input.fixture?.safeTextSummary ??
    "No local Playwright evidence was produced.";
  const redacted = redactBrowserExecutionEvidence({
    actionId: input.executionId,
    executionMode: input.mode,
    runtimeName: `playwright-local ${input.runtimeKind}`,
    target: input.fixture?.fixtureId ?? "local-fixture",
    safeTitle: input.fixture?.safeTitle,
    safeUrl: input.fixture?.safeUrl,
    safeSummary: summary,
    actionTrace: input.actionTrace,
    warnings: input.warnings,
    executed: input.executed,
  });
  const stdout = redactBrowserExecutionEvidence({
    actionId: input.executionId,
    executionMode: "stdout-summary",
    runtimeName: "playwright-local",
    safeSummary: input.stdout ?? "stdout omitted",
    executed: input.executed,
  });
  const stderr = redactBrowserExecutionEvidence({
    actionId: input.executionId,
    executionMode: "stderr-summary",
    runtimeName: "playwright-local",
    safeSummary: input.stderr ?? "stderr omitted",
    executed: input.executed,
  });
  const observation = redactBrowserExecutionEvidence({
    actionId: input.executionId,
    executionMode: "observation-summary",
    runtimeName: "playwright-local",
    safeSummary: input.safeObservationSummary ?? summary,
    executed: input.executed,
  });
  const extraction = redactBrowserExecutionEvidence({
    actionId: input.executionId,
    executionMode: "extraction-summary",
    runtimeName: "playwright-local",
    safeSummary: input.safeExtractionSummary ?? summary,
    executed: input.executed,
  });
  return {
    executionId: redacted.actionId,
    runtimeKind: input.runtimeKind,
    mode: input.mode,
    fixtureId: input.fixture?.fixtureId ?? "none",
    safeUrl: redacted.safeUrl,
    safeTitle: redacted.safeTitle,
    actionKind: input.request.actionKind,
    safeObservationSummary: observation.safeSummary,
    safeExtractionSummary: extraction.safeSummary,
    actionTraceSummary: redacted.actionTraceSummary,
    stdoutSummary: stdout.safeSummary,
    stderrSummary: stderr.safeSummary,
    redactions: Array.from(new Set([
      ...redacted.redactions,
      ...stdout.redactions,
      ...stderr.redactions,
      ...observation.redactions,
      ...extraction.redactions,
    ])),
    warnings: Array.from(new Set([
      ...redacted.warnings,
      ...stdout.warnings,
      ...stderr.warnings,
      ...observation.warnings,
      ...extraction.warnings,
    ])),
    executed: input.executed ? "yes" : "no",
  };
}
