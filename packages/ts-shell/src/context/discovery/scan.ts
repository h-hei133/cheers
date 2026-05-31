import crypto from "node:crypto";
import type { Dirent } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

import { safeTargetLabel } from "../../orchestration/workspaceFileContract.js";

export type RepoIntelligenceFileRole =
  | "entrypoint"
  | "test"
  | "config"
  | "docs"
  | "source";

export interface RepoIntelligenceFile {
  readonly path: string;
  readonly safeLabel: string;
  readonly role: RepoIntelligenceFileRole;
  readonly sizeBytes: number;
  readonly mtimeMs: number;
  readonly symbolHints: readonly string[];
  readonly packageName?: string;
}

export interface RepoIntelligenceCandidate {
  readonly candidateId: string;
  readonly path: string;
  readonly safeLabel: string;
  readonly role: RepoIntelligenceFileRole;
  readonly packageName?: string;
  readonly moduleHint: string;
  readonly score: number;
  readonly scoreComponents: {
    readonly taskTokenOverlap: number;
    readonly roleBoost: number;
    readonly scriptBoost: number;
    readonly exactNameBoost: number;
    readonly primarySourceNameBoost: number;
    readonly freshnessBoost: number;
  };
  readonly reasons: readonly string[];
  readonly pathMatchReasons: readonly string[];
  readonly taskTokenMatchReasons: readonly string[];
  readonly testAdjacencyHints: readonly string[];
  readonly symbolHints: readonly string[];
  readonly freshness: "fresh-stat" | "unknown";
  readonly uncertaintyNotes: readonly string[];
  readonly notProvenClaims: readonly string[];
}

export type RepoDiscoveryConfidence = "high" | "medium" | "low";

export interface RepoDiscoveryScanProfile {
  readonly profileId: string;
  readonly workspaceLabel: string;
  readonly scanMode: "bounded-local-files";
  readonly scanBudget: {
    readonly maxFiles: number;
    readonly pathPriorityPrefillLimit: number;
    readonly pathPriorityScanLimit: number;
  };
  readonly filesConsideredCount: number;
  readonly filesOmittedCount: number;
  readonly omittedReasonCategories: readonly string[];
  readonly rawContentExcluded: true;
  readonly packageMapAvailable: boolean;
  readonly moduleMapAvailable: boolean;
  readonly scanLimitReached: boolean;
  readonly discoveryConfidence: RepoDiscoveryConfidence;
  readonly notProvenClaims: readonly string[];
}

export interface RepoCandidateOmission {
  readonly reason: string;
  readonly count: number;
  readonly exampleLabels: readonly string[];
  readonly notProvenClaims: readonly string[];
}

export type RepoTargetRankingAmbiguityState =
  | "unambiguous-top-candidate"
  | "multiple-plausible-candidates"
  | "weak-signal-candidate"
  | "no-candidate";

export interface RepoTargetRankingEvidence {
  readonly rankingId: string;
  readonly ambiguityState: RepoTargetRankingAmbiguityState;
  readonly selectedCandidateId?: string;
  readonly competingCandidateIds: readonly string[];
  readonly weakCandidateIds: readonly string[];
  readonly missingDiscoveryFacts: readonly string[];
  readonly notProvenClaims: readonly string[];
  readonly evidence: readonly string[];
}

export interface RepoIntelligenceSnapshot {
  readonly snapshotId: string;
  readonly workspaceRootLabel: string;
  readonly packageMap: readonly {
    readonly name: string;
    readonly path: string;
    readonly scripts: readonly string[];
  }[];
  readonly moduleMap: readonly {
    readonly directory: string;
    readonly files: number;
    readonly tests: number;
  }[];
  readonly entrypointMap: readonly string[];
  readonly testMap: readonly string[];
  readonly configMap: readonly string[];
  readonly boundaryHints: readonly string[];
  readonly files: readonly RepoIntelligenceFile[];
  readonly scanProfile: RepoDiscoveryScanProfile;
  readonly candidateOmissions: readonly RepoCandidateOmission[];
  readonly cacheStatus: "disabled" | "enabled-not-used";
  readonly staleIndexWarnings: readonly string[];
  readonly evidence: readonly string[];
}

export interface RepoIntelligenceResult {
  readonly snapshot: RepoIntelligenceSnapshot;
  readonly candidates: readonly RepoIntelligenceCandidate[];
  readonly targetRanking: RepoTargetRankingEvidence;
  readonly recentRelevantFiles: readonly string[];
  readonly missingFacts: readonly string[];
  readonly nextReadSuggestions: readonly string[];
  readonly evidence: readonly string[];
}

export async function buildRepoIntelligence(input: {
  readonly workspaceRoot: string;
  readonly userTask: string;
  readonly maxFiles?: number;
  readonly maxCandidates?: number;
  readonly cache?: { readonly enabled: boolean };
}): Promise<RepoIntelligenceResult> {
  const workspaceRoot = path.resolve(input.workspaceRoot);
  const maxFiles = input.maxFiles ?? 240;
  const maxCandidates = input.maxCandidates ?? 8;
  const packageMap = await discoverPackageMap(workspaceRoot);
  const discovered = await discoverRepoFiles({
    workspaceRoot,
    userTask: input.userTask,
    maxFiles,
    packageMap,
  });
  const files = discovered.files;
  const moduleMap = buildModuleMap(files);
  const snapshotId = buildSnapshotId({ packageMap, files });
  const candidateOmissions = buildCandidateOmissions(discovered.omissions);
  const scanProfile = buildDiscoveryScanProfile({
    workspaceLabel: safeTargetLabel(path.basename(workspaceRoot) || workspaceRoot),
    maxFiles,
    files,
    packageMapAvailable: packageMap.length > 0,
    moduleMapAvailable: moduleMap.length > 0,
    omissions: candidateOmissions,
    filesConsideredCount: discovered.filesConsideredCount,
  });
  const snapshot: RepoIntelligenceSnapshot = {
    snapshotId,
    workspaceRootLabel: safeTargetLabel(path.basename(workspaceRoot) || workspaceRoot),
    packageMap,
    moduleMap,
    entrypointMap: files.filter((file) => file.role === "entrypoint").map((file) => file.safeLabel),
    testMap: files.filter((file) => file.role === "test").map((file) => file.safeLabel),
    configMap: files.filter((file) => file.role === "config").map((file) => file.safeLabel),
    boundaryHints: buildBoundaryHints(packageMap, files),
    files,
    scanProfile,
    candidateOmissions,
    cacheStatus: input.cache?.enabled ? "enabled-not-used" : "disabled",
    staleIndexWarnings: input.cache?.enabled ? ["persistent cache read/write is not implemented by default"] : [],
    evidence: [
      `repo-intelligence:snapshot:${snapshotId}`,
      `repo-intelligence:scan-profile:${scanProfile.profileId}`,
      `repo-intelligence:files:${files.length}`,
      `repo-intelligence:files-omitted:${scanProfile.filesOmittedCount}`,
      `repo-intelligence:packages:${packageMap.length}`,
      `repo-intelligence:cache:${input.cache?.enabled ? "enabled-not-used" : "disabled"}`,
      "repo-intelligence:mutation-authority:not-granted",
      "repo-intelligence:raw-content-excluded",
    ],
  };
  const candidates = rankRepoCandidates({
    files,
    userTask: input.userTask,
    maxCandidates,
  });
  const targetRanking = buildTargetRankingEvidence({
    userTask: input.userTask,
    candidates,
    scanProfile,
  });
  const missingFacts = buildBlockingDiscoveryFacts(targetRanking.missingDiscoveryFacts);
  const nextReadSuggestions =
    candidates.length > 0
      ? candidates.slice(0, 4).map((candidate) => candidate.safeLabel)
      : snapshot.entrypointMap.slice(0, 4);

  return {
    snapshot,
    candidates,
    targetRanking,
    recentRelevantFiles: candidates.slice(0, 5).map((candidate) => candidate.safeLabel),
    missingFacts,
    nextReadSuggestions,
    evidence: [
      ...snapshot.evidence,
      `repo-intelligence:candidates:${candidates.length}`,
      `repo-intelligence:target-ranking:${targetRanking.rankingId}`,
      `repo-intelligence:ambiguity:${targetRanking.ambiguityState}`,
      ...candidates.slice(0, 3).map((candidate) => `repo-intelligence:candidate:${candidate.safeLabel}`),
      ...targetRanking.evidence,
    ],
  };
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
      const freshness = freshnessBoost(file);
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

async function discoverPackageMap(workspaceRoot: string): Promise<RepoIntelligenceSnapshot["packageMap"]> {
  const roots = [workspaceRoot, path.join(workspaceRoot, "packages")];
  const packageJsonPaths: string[] = [];
  for (const root of roots) {
    const entries = await readDir(root);
    for (const entry of entries) {
      const candidate = entry.isDirectory()
        ? path.join(root, entry.name, "package.json")
        : entry.name === "package.json"
          ? path.join(root, entry.name)
          : undefined;
      if (candidate && await fileExists(candidate)) {
        packageJsonPaths.push(candidate);
      }
    }
  }
  const packages = [];
  for (const packageJsonPath of Array.from(new Set(packageJsonPaths))) {
    try {
      const parsed = JSON.parse(await fs.readFile(packageJsonPath, "utf8")) as {
        name?: string;
        scripts?: Record<string, string>;
      };
      packages.push({
        name: parsed.name ?? path.basename(path.dirname(packageJsonPath)),
        path: normalizeRelative(path.relative(workspaceRoot, packageJsonPath)),
        scripts: Object.keys(parsed.scripts ?? {}).sort(),
      });
    } catch {
      packages.push({
        name: path.basename(path.dirname(packageJsonPath)),
        path: normalizeRelative(path.relative(workspaceRoot, packageJsonPath)),
        scripts: [],
      });
    }
  }
  return packages.sort((left, right) => left.path.localeCompare(right.path));
}

interface DiscoveredRepoFiles {
  readonly files: readonly RepoIntelligenceFile[];
  readonly omissions: ReadonlyMap<string, { readonly count: number; readonly examples: readonly string[] }>;
  readonly filesConsideredCount: number;
}

async function discoverRepoFiles(input: {
  readonly workspaceRoot: string;
  readonly userTask: string;
  readonly maxFiles: number;
  readonly packageMap: RepoIntelligenceSnapshot["packageMap"];
}): Promise<DiscoveredRepoFiles> {
  const files: RepoIntelligenceFile[] = [];
  const seen = new Set<string>();
  const omissions = new Map<string, { count: number; examples: string[] }>();
  let filesConsideredCount = 0;
  const scanProfile = buildRepoScanProfile(input.userTask);
  const addOmission = (reason: string, relativePath: string): void => {
    const current = omissions.get(reason) ?? { count: 0, examples: [] };
    omissions.set(reason, {
      count: current.count + 1,
      examples: current.examples.length < 5
        ? [...current.examples, safeTargetLabel(relativePath)]
        : current.examples,
    });
  };
  const addFile = async (relativePath: string): Promise<void> => {
    if (seen.has(relativePath)) {
      return;
    }
    if (files.length >= input.maxFiles) {
      addOmission("scan-budget-reached", relativePath);
      return;
    }
    seen.add(relativePath);
    filesConsideredCount += 1;
    const absolutePath = path.join(input.workspaceRoot, relativePath);
    const stat = await fs.stat(absolutePath);
    const prefix = await readTextPrefix(absolutePath, 16_000);
    files.push({
      path: relativePath,
      safeLabel: safeTargetLabel(relativePath),
      role: classifyFileRole(relativePath),
      sizeBytes: stat.size,
      mtimeMs: stat.mtimeMs,
      symbolHints: extractSymbolHints(prefix, relativePath),
      packageName: findPackageName(relativePath, input.packageMap),
    });
  };
  for (const relativePath of await discoverPathPriorityFilePaths({
    workspaceRoot: input.workspaceRoot,
    profile: scanProfile,
    maxFiles: Math.min(input.maxFiles, PATH_PRIORITY_PREFILL_LIMIT),
  })) {
    await addFile(relativePath);
  }
  const visit = async (directory: string): Promise<void> => {
    if (files.length >= input.maxFiles) {
      addOmission("scan-budget-reached", normalizeRelative(path.relative(input.workspaceRoot, directory)));
      return;
    }
    const entries = sortRepoEntries({
      entries: await readDir(directory),
      directory,
      workspaceRoot: input.workspaceRoot,
      profile: scanProfile,
    });
    for (const entry of entries) {
      if (files.length >= input.maxFiles) {
        return;
      }
      const absolutePath = path.join(directory, entry.name);
      const relativePath = normalizeRelative(path.relative(input.workspaceRoot, absolutePath));
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) {
          await visit(absolutePath);
        } else {
          addOmission("generated-or-vendor-path-excluded", relativePath);
        }
        continue;
      }
      if (!entry.isFile() || !isSupportedRepoFile(entry.name)) {
        addOmission(entry.isFile() ? "file-type-excluded" : "non-file-entry-excluded", relativePath);
        continue;
      }
      await addFile(relativePath);
    }
  };
  await visit(input.workspaceRoot);
  return { files, omissions, filesConsideredCount };
}

async function discoverPathPriorityFilePaths(input: {
  readonly workspaceRoot: string;
  readonly profile: RepoScanProfile;
  readonly maxFiles: number;
}): Promise<readonly string[]> {
  if (input.profile.tokens.length === 0 || input.maxFiles <= 0) {
    return [];
  }
  const candidates: Array<{
    readonly relativePath: string;
    readonly score: number;
  }> = [];
  let visitedEntries = 0;
  const visit = async (directory: string): Promise<void> => {
    if (visitedEntries >= PATH_PRIORITY_SCAN_LIMIT) {
      return;
    }
    const entries = await readDir(directory);
    for (const entry of entries) {
      if (visitedEntries >= PATH_PRIORITY_SCAN_LIMIT) {
        return;
      }
      visitedEntries += 1;
      const absolutePath = path.join(directory, entry.name);
      const relativePath = normalizeRelative(path.relative(input.workspaceRoot, absolutePath));
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) {
          await visit(absolutePath);
        }
        continue;
      }
      if (!entry.isFile() || !isSupportedRepoFile(entry.name)) {
        continue;
      }
      const score = scorePathPriority(relativePath, input.profile);
      if (score > 0) {
        candidates.push({ relativePath, score });
      }
    }
  };
  await visit(input.workspaceRoot);
  return candidates
    .sort((left, right) =>
      right.score - left.score || left.relativePath.localeCompare(right.relativePath),
    )
    .slice(0, input.maxFiles)
    .map((candidate) => candidate.relativePath);
}

function scorePathPriority(
  relativePath: string,
  profile: RepoScanProfile,
): number {
  const pathTokens = tokenize(relativePath);
  const basenameTokens = tokenize(path.basename(relativePath));
  const overlap = countOverlap(profile.tokens, pathTokens);
  if (overlap === 0) {
    return 0;
  }
  const basenameOverlap = countOverlap(profile.tokens, basenameTokens);
  const role = classifyFileRole(relativePath);
  return overlap * 100 +
    basenameOverlap * 24 +
    pathPriorityRoleBoost(role, profile);
}

function pathPriorityRoleBoost(
  role: RepoIntelligenceFileRole,
  profile: RepoScanProfile,
): number {
  if (profile.docsLike) {
    return role === "docs"
      ? 60
      : role === "source"
        ? 22
        : role === "test"
          ? 16
          : 8;
  }
  if (profile.codeLike) {
    return role === "source"
      ? 60
      : role === "test"
        ? 48
        : role === "entrypoint"
          ? 30
          : role === "config"
            ? 14
            : 4;
  }
  return role === "source" ? 32 : role === "test" ? 24 : 12;
}

function buildModuleMap(files: readonly RepoIntelligenceFile[]): RepoIntelligenceSnapshot["moduleMap"] {
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

function buildCandidateOmissions(
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

function buildDiscoveryScanProfile(input: {
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

function buildTargetRankingEvidence(input: {
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

function buildMissingDiscoveryFacts(input: {
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

function buildBlockingDiscoveryFacts(facts: readonly string[]): readonly string[] {
  const blocking = new Set([
    "no candidate files matched the vague task within the bounded repository scan",
    "weak target ranking signal",
    "insufficient scan coverage",
  ]);
  return facts.filter((fact) => blocking.has(fact));
}

function buildTestAdjacencyHints(
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

function hasExplicitPathHint(task: string): boolean {
  return /(?:^|\s)[./\w-]+\.(?:ts|tsx|js|jsx|json|md|yaml|yml)\b/.test(task) ||
    task.includes("/");
}

function hasLikelySymbolHint(task: string): boolean {
  return /\b[A-Za-z_$][A-Za-z0-9_$]*(?:\(\)|\.)/.test(task) ||
    /[a-z][A-Z][A-Za-z0-9_$]*/.test(task);
}

function buildBoundaryHints(
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

function classifyTaskBoosts(task: string): Record<RepoIntelligenceFileRole, number> {
  const lower = task.toLowerCase();
  const editLike = isEditLikeTask(task);
  const testLike = /\b(test|spec|verify|failing|failure|regression)\b/.test(lower);
  return {
    entrypoint: /\b(cli|command|start|entry|flag)\b/.test(lower) ? 34 : 8,
    test: testLike ? (editLike ? 18 : 40) : 4,
    config: /\b(config|script|package|build|tsconfig|eslint|vitest)\b/.test(lower) ? 36 : 2,
    docs: /\b(doc|readme|route|plan|explain)\b/.test(lower) ? 30 : 2,
    source: /\b(bug|fix|feature|implement|route|runtime|context|plan|edit|target)\b/.test(lower) ? (editLike ? 38 : 24) : 10,
  };
}

function isEditLikeTask(task: string): boolean {
  return /\b(edit|change|update|fix|implement|add|remove|refactor)\b/.test(task.toLowerCase());
}

interface RepoScanProfile {
  readonly tokens: readonly string[];
  readonly codeLike: boolean;
  readonly docsLike: boolean;
}

function buildRepoScanProfile(task: string): RepoScanProfile {
  const lower = task.toLowerCase();
  const codeLike = /\b(bug|fix|feature|implement|edit|change|test|spec|verify|runtime|orchestration|package|packages|src|source)\b/.test(lower);
  const docsLike = /\b(doc|docs|readme|explain|route|plan)\b/.test(lower) && !codeLike;
  return {
    tokens: tokenize(task),
    codeLike,
    docsLike,
  };
}

function sortRepoEntries(input: {
  readonly entries: readonly Dirent[];
  readonly directory: string;
  readonly workspaceRoot: string;
  readonly profile: RepoScanProfile;
}): readonly Dirent[] {
  return [...input.entries].sort((left, right) => {
    const leftPriority = repoEntryPriority({
      entry: left,
      directory: input.directory,
      workspaceRoot: input.workspaceRoot,
      profile: input.profile,
    });
    const rightPriority = repoEntryPriority({
      entry: right,
      directory: input.directory,
      workspaceRoot: input.workspaceRoot,
      profile: input.profile,
    });
    return leftPriority - rightPriority || left.name.localeCompare(right.name);
  });
}

function repoEntryPriority(input: {
  readonly entry: Dirent;
  readonly directory: string;
  readonly workspaceRoot: string;
  readonly profile: RepoScanProfile;
}): number {
  const relativePath = normalizeRelative(path.relative(
    input.workspaceRoot,
    path.join(input.directory, input.entry.name),
  ));
  const tokens = tokenize(relativePath);
  const overlap = countOverlap(input.profile.tokens, tokens);
  const firstSegment = relativePath.split("/")[0] ?? relativePath;
  const sourceDir = isSourcePreferredDirectory(firstSegment, relativePath);
  const docsDir = firstSegment === "docs" || firstSegment === "doc";

  if (input.entry.isDirectory()) {
    if (input.profile.docsLike && docsDir) return 0 - overlap * 8;
    if (input.profile.codeLike && sourceDir) return 0 - overlap * 8;
    if (input.profile.codeLike && docsDir) return 80 - overlap * 2;
    if (firstSegment === "contracts") return 20 - overlap * 4;
    return 40 - overlap * 4;
  }

  if (input.entry.name === "package.json") return 4;
  if (input.profile.codeLike && classifyFileRole(relativePath) === "source") return 18 - overlap * 4;
  if (input.profile.codeLike && classifyFileRole(relativePath) === "test") return 22 - overlap * 4;
  if (input.profile.codeLike && classifyFileRole(relativePath) === "docs") return 86 - overlap * 2;
  return 50 - overlap * 3;
}

function isSourcePreferredDirectory(firstSegment: string, relativePath: string): boolean {
  return firstSegment === "packages" ||
    firstSegment === "src" ||
    firstSegment === "apps" ||
    firstSegment === "app" ||
    firstSegment === "lib" ||
    firstSegment === "scripts" ||
    firstSegment === "tests" ||
    relativePath.includes("/src/") ||
    relativePath.includes("/test");
}

function classifyFileRole(relativePath: string): RepoIntelligenceFileRole {
  const base = path.basename(relativePath);
  if (/\.(test|spec)\.(ts|tsx|js|jsx)$/.test(base) || relativePath.includes("__tests__/")) {
    return "test";
  }
  if (/^(package|tsconfig|vitest|eslint|prettier|rollup|vite|jest|pnpm|npm)/.test(base) || /\.(json|yaml|yml)$/.test(base)) {
    return "config";
  }
  if (/README\.md$/i.test(base) || relativePath.startsWith("docs/")) {
    return "docs";
  }
  if (relativePath.includes("entrypoints/") || /(^|\/)(cli|index|main)\.(ts|tsx|js|jsx)$/.test(relativePath)) {
    return "entrypoint";
  }
  return "source";
}

function extractSymbolHints(content: string, relativePath: string): readonly string[] {
  const matches = [
    ...content.matchAll(/\bexport\s+(?:async\s+)?(?:function|class|const|let|var|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g),
    ...content.matchAll(/\b(?:function|class)\s+([A-Za-z_$][\w$]*)/g),
    ...content.matchAll(/\bdescribe\(["'`]([^"'`]+)["'`]/g),
    ...content.matchAll(/"([A-Za-z0-9:_-]{4,})"\s*:/g),
  ].map((match) => match[1]).filter((value): value is string => Boolean(value));
  return Array.from(new Set([...matches, path.parse(relativePath).name])).slice(0, 10);
}

async function readTextPrefix(filePath: string, length: number): Promise<string> {
  try {
    const content = await fs.readFile(filePath, "utf8");
    return content.slice(0, length);
  } catch {
    return "";
  }
}

async function readDir(directory: string): Promise<Dirent[]> {
  try {
    return await fs.readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function findPackageName(
  relativePath: string,
  packageMap: RepoIntelligenceSnapshot["packageMap"],
): string | undefined {
  return packageMap
    .filter((pkg) => relativePath === pkg.path || relativePath.startsWith(`${path.dirname(pkg.path)}/`))
    .sort((left, right) => right.path.length - left.path.length)[0]?.name;
}

function tokenize(value: string): string[] {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3)
    .filter((token) => !STOP_WORDS.has(token));
}

function countOverlap(left: readonly string[], right: readonly string[]): number {
  const rightSet = new Set(right);
  return Array.from(new Set(left)).filter((token) => rightSet.has(token)).length;
}

function freshnessBoost(file: RepoIntelligenceFile): number {
  return file.mtimeMs > 0 ? 3 : 0;
}

function buildSnapshotId(input: object): string {
  return `repo_intel_${crypto.createHash("sha256").update(JSON.stringify(input)).digest("hex").slice(0, 12)}`;
}

function normalizeRelative(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.$/, "");
}

function isSupportedRepoFile(fileName: string): boolean {
  return /\.(?:ts|tsx|js|jsx|json|md|yaml|yml)$/i.test(fileName);
}

const IGNORED_DIRS = new Set([
  ".claude",
  ".codex",
  ".git",
  ".omx",
  ".sisyphus",
  ".turbo",
  "coverage",
  "dist",
  "node_modules",
  "target",
]);

const PATH_PRIORITY_PREFILL_LIMIT = 96;
const PATH_PRIORITY_SCAN_LIMIT = 5_000;
const WEAK_CANDIDATE_SCORE_THRESHOLD = 50;

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "this",
  "that",
  "into",
  "need",
  "needs",
  "make",
  "route",
]);
