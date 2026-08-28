import path from "node:path";
import { safeTargetLabel } from "../../orchestration/workspaceFileContract.js";
import type {
  RepoCandidateOmission,
  RepoDiscoveryConfidence,
  RepoDiscoveryScanProfile,
  RepoIntelligenceCandidate,
  RepoIntelligenceFile,
  RepoIntelligenceSnapshot,
  RepoTargetRankingAmbiguityState,
  RepoTargetRankingEvidence,
} from "./types.js";
import {
  classifyTaskBoosts,
  countOverlap,
  isEditLikeTask,
  PATH_PRIORITY_PREFILL_LIMIT,
  PATH_PRIORITY_SCAN_LIMIT,
  tokenize,
  WEAK_CANDIDATE_SCORE_THRESHOLD,
} from "./scorer.js";
import { buildSnapshotId, normalizeRelative } from "./scanner.js";

export function buildModuleMap(files: readonly RepoIntelligenceFile[]): RepoIntelligenceSnapshot["moduleMap"] {
  const modules = new Map<string, { files: number; tests: number }>();
  for (const file of files) {
    if (file.role !== "source" && file.role !== "test") {
      continue;
    }
    const directory = normalizeRelative(path.dirname(file.path));
    const current = modules.get(directory) ?? { files: 0, tests: 0 };
    modules.set(directory, {
      files: current.files + 1,
      tests: current.tests + (file.role === "test" ? 1 : 0),
    });
  }
  return Array.from(modules.entries())
    .map(([directory, value]) => ({ directory, ...value }))
    .sort((left, right) => right.files - left.files || left.directory.localeCompare(right.directory))
    .slice(0, 24);
}

export function buildCandidateOmissions(
  omissions: ReadonlyMap<string, { readonly count: number; readonly examples: readonly string[] }>,
): readonly RepoCandidateOmission[] {
  return Array.from(omissions.entries())
    .map(([reason, value]) => ({
      reason,
      count: value.count,
      exampleLabels: value.examples,
      notProvenClaims: ["omitted-file-is-not-irrelevant"],
    }))
    .sort((left, right) => right.count - left.count || left.reason.localeCompare(right.reason));
}

export function buildDiscoveryScanProfile(input: {
  readonly workspaceLabel: string;
  readonly maxFiles: number;
  readonly files: readonly RepoIntelligenceFile[];
  readonly packageMapAvailable: boolean;
  readonly moduleMapAvailable: boolean;
  readonly omissions: readonly RepoCandidateOmission[];
  readonly filesConsideredCount: number;
}): RepoDiscoveryScanProfile {
  const filesOmittedCount = input.omissions.reduce((sum, omission) => sum + omission.count, 0);
  const scanLimitReached = input.omissions.some((omission) => omission.reason === "scan-budget-reached");
  const discoveryConfidence: RepoDiscoveryConfidence = scanLimitReached
    ? "low"
    : input.files.length === 0
      ? "low"
      : filesOmittedCount > 0
        ? "medium"
        : "high";
  return {
    profileId: `repo_scan_${buildSnapshotId({
      workspaceLabel: input.workspaceLabel,
      files: input.files.map((file) => file.safeLabel),
      omissions: input.omissions.map((omission) => `${omission.reason}:${omission.count}`),
    }).slice("repo_intel_".length)}`,
    workspaceLabel: input.workspaceLabel,
    scanMode: "bounded-local-files",
    scanBudget: {
      maxFiles: input.maxFiles,
      pathPriorityPrefillLimit: PATH_PRIORITY_PREFILL_LIMIT,
      pathPriorityScanLimit: PATH_PRIORITY_SCAN_LIMIT,
    },
    filesConsideredCount: input.filesConsideredCount,
    filesOmittedCount,
    omittedReasonCategories: input.omissions.map((omission) => omission.reason),
    rawContentExcluded: true,
    packageMapAvailable: input.packageMapAvailable,
    moduleMapAvailable: input.moduleMapAvailable,
    scanLimitReached,
    discoveryConfidence,
    notProvenClaims: [
      "scan-completed-is-not-repository-understanding",
      "context-found-is-not-enough-context",
      "omitted-files-remain-unproven",
    ],
  };
}

export function buildTargetRankingEvidence(input: {
  readonly userTask: string;
  readonly candidates: readonly RepoIntelligenceCandidate[];
  readonly scanProfile: RepoDiscoveryScanProfile;
}): RepoTargetRankingEvidence {
  const selected = input.candidates[0];
  const second = input.candidates[1];
  const weakCandidateIds = input.candidates
    .filter((candidate) => candidate.score < WEAK_CANDIDATE_SCORE_THRESHOLD)
    .map((candidate) => candidate.candidateId);
  const competingCandidateIds = input.candidates
    .slice(1, 4)
    .filter((candidate) => selected ? selected.score - candidate.score <= 18 : true)
    .map((candidate) => candidate.candidateId);
  const ambiguityState: RepoTargetRankingAmbiguityState = !selected
    ? "no-candidate"
    : selected.score < WEAK_CANDIDATE_SCORE_THRESHOLD
      ? "weak-signal-candidate"
      : second && selected.score - second.score <= 18
        ? "multiple-plausible-candidates"
        : "unambiguous-top-candidate";
  const missingDiscoveryFacts = buildMissingDiscoveryFacts({
    userTask: input.userTask,
    ambiguityState,
    scanProfile: input.scanProfile,
    selected,
    competingCandidateIds,
  });
  const rankingId = `target_ranking_${buildSnapshotId({
    task: input.userTask,
    selected: selected?.safeLabel,
    competingCandidateIds,
    ambiguityState,
  }).slice("repo_intel_".length)}`;
  return {
    rankingId,
    ambiguityState,
    selectedCandidateId: selected?.candidateId,
    competingCandidateIds,
    weakCandidateIds,
    missingDiscoveryFacts,
    notProvenClaims: [
      "high-ranked-file-is-not-correct-target",
      "selected-candidate-is-not-edit-authority",
      "target-ranking-is-not-task-success",
    ],
    evidence: [
      `repo-intelligence:target-ranking:${rankingId}`,
      `repo-intelligence:target-ranking-ambiguity:${ambiguityState}`,
      `repo-intelligence:target-ranking-missing-facts:${missingDiscoveryFacts.length}`,
    ],
  };
}

export function buildMissingDiscoveryFacts(input: {
  readonly userTask: string;
  readonly ambiguityState: RepoTargetRankingAmbiguityState;
  readonly scanProfile: RepoDiscoveryScanProfile;
  readonly selected?: RepoIntelligenceCandidate;
  readonly competingCandidateIds: readonly string[];
}): readonly string[] {
  const facts = [
    hasExplicitPathHint(input.userTask) ? undefined : "missing explicit file path",
    hasLikelySymbolHint(input.userTask) ? undefined : "missing symbol name",
    input.scanProfile.packageMapAvailable ? undefined : "missing package or workspace scope",
    input.scanProfile.scanLimitReached ? "insufficient scan coverage" : undefined,
    input.ambiguityState === "no-candidate"
      ? "no candidate files matched the vague task within the bounded repository scan"
      : undefined,
    input.ambiguityState === "weak-signal-candidate" ? "weak target ranking signal" : undefined,
    input.ambiguityState === "multiple-plausible-candidates" ? "ambiguous candidate set" : undefined,
    input.competingCandidateIds.length > 0 ? "target family uncertainty" : undefined,
    input.selected?.testAdjacencyHints.length ? undefined : "missing test target",
  ].filter((fact): fact is string => Boolean(fact));
  return Array.from(new Set(facts));
}

export function buildBlockingDiscoveryFacts(facts: readonly string[]): readonly string[] {
  const blocking = new Set([
    "no candidate files matched the vague task within the bounded repository scan",
    "weak target ranking signal",
    "insufficient scan coverage",
  ]);
  return facts.filter((fact) => blocking.has(fact));
}

export function buildTestAdjacencyHints(
  file: RepoIntelligenceFile,
  files: readonly RepoIntelligenceFile[],
): readonly string[] {
  if (file.role === "test") {
    return ["candidate-is-test"];
  }
  const baseName = path.parse(file.path).name.toLowerCase();
  return files
    .filter((candidate) =>
      candidate.role === "test" &&
      path.parse(candidate.path).name.toLowerCase().startsWith(baseName)
    )
    .slice(0, 4)
    .map((candidate) => `related-test:${candidate.safeLabel}`);
}

export function hasExplicitPathHint(task: string): boolean {
  return /(?:^|\s)[./\w-]+\.(?:ts|tsx|js|jsx|json|md|yaml|yml)\b/.test(task) ||
    task.includes("/");
}

export function hasLikelySymbolHint(task: string): boolean {
  return /\b[A-Za-z_$][A-Za-z0-9_$]*(?:\(\)|\.)/.test(task) ||
    /[a-z][A-Z][A-Za-z0-9_$]*/.test(task);
}

export function buildBoundaryHints(
  packageMap: RepoIntelligenceSnapshot["packageMap"],
  files: readonly RepoIntelligenceFile[],
): readonly string[] {
  const hints = [
    packageMap.length > 1 ? `workspace-packages:${packageMap.map((pkg) => pkg.name).join(",")}` : undefined,
    files.some((file) => file.path.includes("orchestration/")) ? "typescript-control-plane:orchestration" : undefined,
    files.some((file) => file.path.includes("entrypoints/")) ? "entrypoints-should-stay-light" : undefined,
    files.some((file) => file.path.includes("session/")) ? "session-runtime-boundary-present" : undefined,
  ].filter((hint): hint is string => Boolean(hint));
  return hints.length > 0 ? hints : ["bounded-repo-scan:no-special-boundary-detected"];
}

export function rankRepoCandidates(input: {
  readonly files: readonly RepoIntelligenceFile[];
  readonly userTask: string;
  readonly maxCandidates?: number;
}): readonly RepoIntelligenceCandidate[] {
  const tokens = tokenize(input.userTask);
  const actionBoosts = classifyTaskBoosts(input.userTask);
  const editLike = isEditLikeTask(input.userTask);
  return input.files
    .map((file) => {
      const pathTokens = tokenize(file.path);
      const symbolTokens = file.symbolHints.flatMap(tokenize);
      const basenameTokens = tokenize(path.basename(file.path));
      const overlap = countOverlap(tokens, [...pathTokens, ...symbolTokens]);
      const roleBoost = actionBoosts[file.role] ?? 0;
      const scriptBoost = file.path === "package.json" && tokens.some((token) => ["script", "test", "build"].includes(token)) ? 28 : 0;
      const exactNameBoost = tokens.some((token) => path.basename(file.path).toLowerCase().includes(token)) ? 18 : 0;
      const primarySourceNameBoost =
        editLike && file.role === "source" && countOverlap(tokens, basenameTokens) >= 2
          ? 40
          : 0;
      const freshness = file.mtimeMs > 0 ? 3 : 0;
      const score = overlap * 14 + roleBoost + scriptBoost + exactNameBoost + primarySourceNameBoost + freshness;
      const reasons = [
        overlap > 0 ? `task-token-overlap:${overlap}` : undefined,
        roleBoost > 0 ? `role:${file.role}` : undefined,
        scriptBoost > 0 ? "package-script-query" : undefined,
        exactNameBoost > 0 ? "path-name-match" : undefined,
        primarySourceNameBoost > 0 ? "primary-source-name-match" : undefined,
      ].filter((reason): reason is string => Boolean(reason));
      return {
        candidateId: `repo_candidate_${buildSnapshotId({ path: file.safeLabel, score }).slice("repo_intel_".length)}`,
        path: file.path,
        safeLabel: file.safeLabel,
        role: file.role,
        packageName: file.packageName,
        moduleHint: normalizeRelative(path.dirname(file.path)),
        score,
        scoreComponents: {
          taskTokenOverlap: overlap * 14,
          roleBoost,
          scriptBoost,
          exactNameBoost,
          primarySourceNameBoost,
          freshnessBoost: freshness,
        },
        reasons,
        pathMatchReasons: [
          exactNameBoost > 0 ? "basename-token-match" : undefined,
          primarySourceNameBoost > 0 ? "primary-source-basename-match" : undefined,
          countOverlap(tokens, pathTokens) > 0 ? `path-token-overlap:${countOverlap(tokens, pathTokens)}` : undefined,
        ].filter((reason): reason is string => Boolean(reason)),
        taskTokenMatchReasons: overlap > 0
          ? Array.from(new Set(tokens)).filter((token) =>
            pathTokens.includes(token) || symbolTokens.includes(token)
          ).map((token) => `task-token:${token}`)
          : [],
        testAdjacencyHints: buildTestAdjacencyHints(file, input.files),
        symbolHints: file.symbolHints,
        freshness: "fresh-stat" as const,
        uncertaintyNotes: [
          score < WEAK_CANDIDATE_SCORE_THRESHOLD ? "weak-ranking-signal" : undefined,
          file.role === "docs" && editLike ? "docs-candidate-for-edit-like-task" : undefined,
        ].filter((note): note is string => Boolean(note)),
        notProvenClaims: [
          "candidate-found-is-not-context-success",
          "high-rank-is-not-correct-target",
          "selected-candidate-is-not-edit-authority",
        ],
      };
    })
    .filter((candidate) => candidate.reasons.some((reason) =>
      reason.startsWith("task-token-overlap:") ||
      reason === "path-name-match" ||
      reason === "package-script-query"
    ))
    .sort((left, right) => right.score - left.score || left.safeLabel.localeCompare(right.safeLabel))
    .slice(0, input.maxCandidates ?? 8);
}
