import type { ProjectMemoryFutureTurnCandidateContext } from "./projectMemoryFutureTurnAdapter.js";
import type { ProjectMemoryConflictDetectionResult } from "./projectMemoryConflictDetection.js";

export type ProjectMemoryInjectionQualityStatus = "pass" | "warn" | "fail";

export interface ProjectMemoryInjectionQualityResult {
  readonly qualityStatus: ProjectMemoryInjectionQualityStatus;
  readonly score: number;
  readonly checklist: readonly {
    readonly id: string;
    readonly status: "pass" | "warn" | "fail";
    readonly message: string;
  }[];
  readonly warnings: readonly {
    readonly id: string;
    readonly message: string;
  }[];
  readonly blockers: readonly {
    readonly id: string;
    readonly message: string;
  }[];
  readonly estimatedSize: number;
  readonly evidence: readonly string[];
}

export interface EvaluateProjectMemoryInjectionQualityInput {
  readonly candidate: ProjectMemoryFutureTurnCandidateContext;
  readonly injectedContext: string;
  readonly conflictDetection: ProjectMemoryConflictDetectionResult;
  readonly maxInjectedContextChars?: number;
}

export function evaluateProjectMemoryInjectionQuality(
  input: EvaluateProjectMemoryInjectionQualityInput,
): ProjectMemoryInjectionQualityResult {
  const facts = input.candidate.structuredFacts;
  const maxChars = input.maxInjectedContextChars ?? 10_000;
  const estimatedSize = input.injectedContext.length;
  const checks = [
    check(input.candidate.recordIds.length > 0, "hasRecords", "Selected memory records are present."),
    check(
      input.candidate.injectionStatus === "safe-to-inject",
      "hasSafeRecordsOnly",
      "Selected memory records are safe to inject.",
    ),
    check(
      !input.candidate.excludedRecords.some((record) => record.endsWith(":invalidated")),
      "excludesInvalidatedRecords",
      "Invalidated memory records are excluded.",
      "warn",
    ),
    check(
      !input.candidate.excludedRecords.some((record) => record.endsWith(":deleted")),
      "excludesDeletedRecords",
      "Deleted memory records are excluded.",
      "warn",
    ),
    check(facts.evidenceReferences.length > 0, "hasEvidenceReferences", "Evidence references are present."),
    check(Boolean(input.candidate.mode), "hasMode", "Injection mode is present."),
    check(/(^|\n)Next action(\n|$)/i.test(input.injectedContext), "hasNextAction", "Next action is present."),
    check(!containsRawContent(input.injectedContext), "hasNoRawContentLeak", "No raw content marker is present."),
    check(!containsSecret(input.injectedContext), "hasNoSecretLeak", "No secret-looking value is present."),
    check(
      !containsHiddenReasoning(input.injectedContext),
      "hasNoHiddenReasoningLeak",
      "No hidden reasoning marker is present.",
    ),
    check(
      !claimsAutomaticInjection(input.injectedContext),
      "hasNoAutomaticInjectionClaim",
      "Injected context does not claim automatic memory injection.",
    ),
    check(
      !claimsStartupAutoload(input.injectedContext),
      "hasNoStartupAutoloadClaim",
      "Injected context does not claim startup auto-load.",
    ),
    check(
      !claimsProviderRetrieval(input.injectedContext),
      "hasNoProviderRetrievalClaim",
      "Injected context does not claim provider/model retrieval.",
    ),
    check(
      input.conflictDetection.conflictStatus !== "fail",
      "conflictStatus",
      "No clear memory conflict blocks injection.",
    ),
    check(
      estimatedSize <= maxChars,
      "estimatedSize",
      `Estimated injected memory context size is ${estimatedSize}/${maxChars} chars.`,
      "warn",
    ),
  ];
  const blockers = checks
    .filter((entry) => entry.status === "fail")
    .map((entry) => ({ id: entry.id, message: entry.message }));
  const warnings = checks
    .filter((entry) => entry.status === "warn")
    .map((entry) => ({ id: entry.id, message: entry.message }));
  const passed = checks.filter((entry) => entry.status === "pass").length;
  const score = Math.round((passed / checks.length) * 100);

  return {
    qualityStatus: blockers.length > 0 ? "fail" : warnings.length > 0 ? "warn" : "pass",
    score,
    checklist: checks,
    warnings,
    blockers,
    estimatedSize,
    evidence: [
      "project-memory-injection-quality:checked",
      "project-memory-injection-quality:no-provider-call",
      "project-memory-injection-quality:no-persistence",
      blockers.length > 0
        ? "project-memory-injection-quality:fail"
        : warnings.length > 0
          ? "project-memory-injection-quality:warn"
          : "project-memory-injection-quality:pass",
    ],
  };
}

function check(
  passed: boolean,
  id: string,
  message: string,
  missingSeverity: "warn" | "fail" = "fail",
): ProjectMemoryInjectionQualityResult["checklist"][number] {
  return {
    id,
    status: passed ? "pass" : missingSeverity,
    message,
  };
}

function containsRawContent(value: string): boolean {
  return leakCandidateLines(value).some((line) => /\bRAW_[A-Z0-9_]+\b/.test(line));
}

function containsSecret(value: string): boolean {
  return /\b(sk-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/.test(value);
}

function containsHiddenReasoning(value: string): boolean {
  return leakCandidateLines(value).some((line) => /\b(hidden reasoning|chain[- ]?of[- ]?thought)\b/i.test(line));
}

function leakCandidateLines(value: string): readonly string[] {
  return value
    .split(/\r?\n/)
    .filter((line) => !/\b(excluded|redacted|redactions?)\b/i.test(line));
}

function claimsAutomaticInjection(value: string): boolean {
  return /automatic memory injection\s*(?::|is)\s*(enabled|available|yes|true)/i.test(value);
}

function claimsStartupAutoload(value: string): boolean {
  return /startup auto-load\s*(?::|is)\s*(enabled|available|yes|true)/i.test(value);
}

function claimsProviderRetrieval(value: string): boolean {
  return /provider(?:\/model)? retrieval\s*(?::|is)\s*(enabled|available|yes|true)/i.test(value);
}
