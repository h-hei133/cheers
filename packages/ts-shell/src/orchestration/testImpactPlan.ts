import { isAllowlistedRunCommand } from "./capabilityBoundaryProjection.js";
import type { ContextGraph } from "./contextGraph.js";
import type { ContextGraphScore } from "./contextGraphScore.js";

export interface TestImpactVerificationCandidate {
  readonly command: string;
  readonly source: "allowlisted-generic" | "targeted-test";
  readonly readiness: "ready" | "not-allowlisted";
  readonly reason: string;
}

export interface TestImpactPlan {
  readonly impactPlanId: string;
  readonly graphId: string;
  readonly likelyTestFiles: readonly string[];
  readonly likelyVerificationCommandCandidates: readonly TestImpactVerificationCandidate[];
  readonly confidence: "high" | "medium" | "low";
  readonly missingTestContext: readonly string[];
  readonly suggestedReads: readonly string[];
  readonly commandReadiness: "ready" | "missing-verification" | "not-allowlisted";
  readonly noWriteEvidence: readonly string[];
  readonly replaySafeSummary: string;
  readonly evidence: readonly string[];
}

export function buildTestImpactPlan(input: {
  readonly graph: ContextGraph;
  readonly score: ContextGraphScore;
}): TestImpactPlan {
  const likelyTestFiles = input.graph.includedCandidates
    .filter((node) => node.kind === "nearby-test")
    .map((node) => node.pathLabel);
  const omittedTests = input.graph.omittedCandidates
    .filter((node) => /test|spec/i.test(node.pathLabel))
    .map((node) => node.pathLabel);
  const suggestedReads = Array.from(
    new Set([
      ...omittedTests,
      ...input.graph.omittedCandidates
        .filter((node) => node.omissionReason !== "secret-risk")
        .slice(0, 4)
        .map((node) => node.pathLabel),
    ]),
  );
  const likelyVerificationCommandCandidates = buildVerificationCandidates(likelyTestFiles);
  const commandReadiness = classifyCommandReadiness(likelyVerificationCommandCandidates);
  const confidence =
    likelyTestFiles.length > 0 && input.score.planningReadiness === "context-ready"
      ? "high"
      : likelyTestFiles.length > 0
        ? "medium"
        : "low";
  const missingTestContext = [
    ...(likelyTestFiles.length === 0 ? ["no nearby test files included"] : []),
    ...(omittedTests.length > 0 ? ["some test candidates omitted by budget or safety"] : []),
  ];
  const impactPlanId = `test_impact_${input.graph.graphId.replace(/^ctx_graph_/, "")}`;
  const replaySafeSummary = [
    `test-impact ${impactPlanId}`,
    `graph=${input.graph.graphId}`,
    `tests=${likelyTestFiles.length}`,
    `commands=${likelyVerificationCommandCandidates.length}`,
    `readiness=${commandReadiness}`,
    "mutationAuthority=not-granted",
  ].join("; ");

  return {
    impactPlanId,
    graphId: input.graph.graphId,
    likelyTestFiles,
    likelyVerificationCommandCandidates,
    confidence,
    missingTestContext,
    suggestedReads,
    commandReadiness,
    noWriteEvidence: [
      "test-impact:mutation-authority:not-granted",
      "test-impact:commands:not-executed",
      "test-impact:provider-call:not-run",
    ],
    replaySafeSummary,
    evidence: [
      `test-impact:id:${impactPlanId}`,
      `test-impact:graph:${input.graph.graphId}`,
      `test-impact:tests:${likelyTestFiles.length}`,
      `test-impact:command-readiness:${commandReadiness}`,
      `test-impact:confidence:${confidence}`,
      "test-impact:mutation-authority:not-granted",
      "test-impact:commands:not-executed",
      "test-impact:provider-call:not-run",
    ],
  };
}

function buildVerificationCandidates(
  likelyTestFiles: readonly string[],
): readonly TestImpactVerificationCandidate[] {
  if (likelyTestFiles.length === 0) {
    return [];
  }
  const targeted = likelyTestFiles.slice(0, 2).map((file) => {
    const command = focusedTestCommandFor(file);
    return {
      command,
      source: "targeted-test" as const,
      readiness: isAllowlistedRunCommand(command) ? "ready" as const : "not-allowlisted" as const,
      reason: isAllowlistedRunCommand(command)
        ? "targeted test command is allowlisted"
        : "targeted test command is outside the existing verification allowlist",
    };
  });
  return [
    {
      command: "npm test -- --help",
      source: "allowlisted-generic",
      readiness: "ready",
      reason: "existing allowlisted test command candidate",
    },
    ...targeted,
  ];
}

function focusedTestCommandFor(file: string): string {
  const normalized = file.replace(/^packages\/ts-shell\//, "");
  return normalized.startsWith("src/")
    ? `npm test -w packages/ts-shell -- ${normalized}`
    : `npm test -- ${file}`;
}

function classifyCommandReadiness(
  candidates: readonly TestImpactVerificationCandidate[],
): TestImpactPlan["commandReadiness"] {
  if (candidates.length === 0) {
    return "missing-verification";
  }
  if (candidates.some((candidate) => candidate.readiness === "ready")) {
    return "ready";
  }
  return "not-allowlisted";
}
