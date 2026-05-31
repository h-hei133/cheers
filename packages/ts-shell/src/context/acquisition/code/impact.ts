import crypto from "node:crypto";

import { queryCodeGraphTrace, type CodeGraphQueryResult } from "./query.js";
import type { CodeGraphTrace } from "./trace.js";

export interface CodeGraphImpact {
  readonly impactQueryId: string;
  readonly traceId: string;
  readonly rootTarget: string;
  readonly affectedSymbols: readonly string[];
  readonly likelyCallSites: readonly string[];
  readonly likelyTests: readonly string[];
  readonly docsReferences: readonly string[];
  readonly verificationCandidates: readonly string[];
  readonly omittedContext: readonly string[];
  readonly staleContext: readonly string[];
  readonly confidence: "high" | "medium" | "low";
  readonly readiness:
    | "impact-ready"
    | "impact-partial"
    | "stale-warning"
    | "no-impact-candidates"
    | "needs-more-context";
  readonly suggestedReads: readonly string[];
  readonly suggestedVerification: readonly string[];
  readonly planQualityContribution: {
    readonly impactConfidenceScore: number;
    readonly staleRisk: "none" | "low" | "high";
    readonly omittedRisk: "none" | "low" | "high";
  };
  readonly mutationAuthority: "not-granted";
  readonly redactionStatus: "redacted-and-budgeted";
  readonly replaySafeSummary: string;
  readonly evidence: readonly string[];
}

export function buildCodeGraphImpact(input: {
  readonly trace: CodeGraphTrace;
  readonly target?: string;
}): CodeGraphImpact {
  const target = input.target?.trim() || input.trace.rootTarget;
  const tests = queryCodeGraphTrace({ trace: input.trace, type: "tests-for-target", target });
  const callSites = queryCodeGraphTrace({ trace: input.trace, type: "call-sites-for-symbol", target });
  const docs = queryCodeGraphTrace({ trace: input.trace, type: "docs-for-target", target });
  const verification = queryCodeGraphTrace({
    trace: input.trace,
    type: "verification-candidates-for-target",
    target,
  });
  const omitted = queryCodeGraphTrace({ trace: input.trace, type: "omitted-context-for-target", target });
  const imports = queryCodeGraphTrace({ trace: input.trace, type: "imports-for-target", target });
  const queries = [tests, callSites, docs, verification, omitted, imports];
  const staleContext = Array.from(
    new Set([
      ...input.trace.stalenessSummary.staleLabels,
      ...queries.flatMap((query) =>
        query.candidates
          .filter((candidate) => candidate.freshness === "stale")
          .map((candidate) => candidate.safeLabel),
      ),
    ]),
  );
  const omittedContext = omitted.candidates.map((candidate) => candidate.safeLabel);
  const suggestedReads = Array.from(
    new Set([
      ...omittedContext,
      ...imports.candidates.map((candidate) => candidate.safeLabel),
      ...callSites.candidates.map((candidate) => candidate.safeLabel),
      ...docs.candidates.map((candidate) => candidate.safeLabel),
    ]),
  ).slice(0, 8);
  const suggestedVerification = verification.candidates.map((candidate) => candidate.safeLabel);
  const confidence = classifyConfidence({ trace: input.trace, staleContext, omittedContext, tests, callSites });
  const readiness = classifyReadiness({
    trace: input.trace,
    staleContext,
    candidates: [
      ...tests.candidates,
      ...callSites.candidates,
      ...docs.candidates,
      ...verification.candidates,
      ...imports.candidates,
    ].length,
  });
  const impactQueryId = buildImpactId({
    traceId: input.trace.traceId,
    target,
    readiness,
    confidence,
    suggestedReads,
    suggestedVerification,
  });
  const planQualityContribution = {
    impactConfidenceScore: confidence === "high" ? 100 : confidence === "medium" ? 70 : 30,
    staleRisk: staleContext.length > 0 ? "high" as const : "none" as const,
    omittedRisk: omittedContext.length > 0
      ? input.trace.impactReadiness === "impact-partial"
        ? "low" as const
        : "high" as const
      : "none" as const,
  };
  const replaySafeSummary = [
    `code-graph-impact ${impactQueryId}`,
    `trace=${input.trace.traceId}`,
    `target=${target}`,
    `tests=${tests.candidates.length}`,
    `callSites=${callSites.candidates.length}`,
    `docs=${docs.candidates.length}`,
    `verification=${verification.candidates.length}`,
    `stale=${staleContext.length}`,
    `readiness=${readiness}`,
    "mutationAuthority=not-granted",
    "raw-content-excluded",
  ].join("; ");

  return {
    impactQueryId,
    traceId: input.trace.traceId,
    rootTarget: target,
    affectedSymbols: input.trace.facts
      .filter((fact) => fact.kind === "symbol-node")
      .map((fact) => fact.safeLabel),
    likelyCallSites: callSites.candidates.map((candidate) => candidate.safeLabel),
    likelyTests: tests.candidates.map((candidate) => candidate.safeLabel),
    docsReferences: docs.candidates.map((candidate) => candidate.safeLabel),
    verificationCandidates: suggestedVerification,
    omittedContext,
    staleContext,
    confidence,
    readiness,
    suggestedReads,
    suggestedVerification,
    planQualityContribution,
    mutationAuthority: "not-granted",
    redactionStatus: "redacted-and-budgeted",
    replaySafeSummary,
    evidence: [
      replaySafeSummary,
      ...queries.flatMap((query) => query.evidence),
      `code-graph-impact:id:${impactQueryId}`,
      `code-graph-impact:trace:${input.trace.traceId}`,
      `code-graph-impact:readiness:${readiness}`,
      `code-graph-impact:confidence:${confidence}`,
      "code-graph-impact:mutation-authority:not-granted",
      "code-graph-impact:raw-content-excluded",
    ],
  };
}

function classifyConfidence(input: {
  readonly trace: CodeGraphTrace;
  readonly staleContext: readonly string[];
  readonly omittedContext: readonly string[];
  readonly tests: CodeGraphQueryResult;
  readonly callSites: CodeGraphQueryResult;
}): CodeGraphImpact["confidence"] {
  if (input.staleContext.length > 0) {
    return "low";
  }
  if (input.omittedContext.length > 2 || input.trace.impactReadiness === "needs-more-context") {
    return "low";
  }
  if (input.tests.candidates.length > 0 && input.callSites.candidates.length > 0) {
    return "high";
  }
  return "medium";
}

function classifyReadiness(input: {
  readonly trace: CodeGraphTrace;
  readonly staleContext: readonly string[];
  readonly candidates: number;
}): CodeGraphImpact["readiness"] {
  if (input.staleContext.length > 0 || input.trace.impactReadiness === "stale-warning") {
    return "stale-warning";
  }
  if (input.candidates === 0) {
    return "no-impact-candidates";
  }
  if (input.trace.impactReadiness === "impact-partial") {
    return "impact-partial";
  }
  if (input.trace.impactReadiness === "needs-more-context") {
    return "needs-more-context";
  }
  return "impact-ready";
}

function buildImpactId(input: {
  readonly traceId: string;
  readonly target: string;
  readonly readiness: string;
  readonly confidence: string;
  readonly suggestedReads: readonly string[];
  readonly suggestedVerification: readonly string[];
}): string {
  return `code_graph_impact_${crypto.createHash("sha256").update(JSON.stringify(input)).digest("hex").slice(0, 12)}`;
}
