import path from "node:path";
import { safeTargetLabel } from "../../orchestration/workspaceFileContract.js";
import type {
  RepoIntelligenceResult,
  RepoIntelligenceSnapshot,
} from "./types.js";
import { buildRepoScanProfile } from "./scorer.js";
import {
  buildSnapshotId,
  discoverPackageMap,
  discoverRepoFiles,
} from "./scanner.js";
import {
  buildBlockingDiscoveryFacts,
  buildBoundaryHints,
  buildCandidateOmissions,
  buildDiscoveryScanProfile,
  buildModuleMap,
  buildTargetRankingEvidence,
  rankRepoCandidates,
} from "./ranker.js";

export * from "./types.js";
export * from "./scorer.js";
export * from "./scanner.js";
export * from "./ranker.js";

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
  const scanProfile = buildRepoScanProfile(input.userTask);
  const discovered = await discoverRepoFiles({
    workspaceRoot,
    userTask: input.userTask,
    maxFiles,
    packageMap,
    scanProfile,
  });
  const files = discovered.files;
  const moduleMap = buildModuleMap(files);
  const snapshotId = buildSnapshotId({ packageMap, files });
  const candidateOmissions = buildCandidateOmissions(discovered.omissions);
  const discoveryProfile = buildDiscoveryScanProfile({
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
    scanProfile: discoveryProfile,
    candidateOmissions,
    cacheStatus: input.cache?.enabled ? "enabled-not-used" : "disabled",
    staleIndexWarnings: input.cache?.enabled ? ["persistent cache read/write is not implemented by default"] : [],
    evidence: [
      `repo-intelligence:snapshot:${snapshotId}`,
      `repo-intelligence:scan-profile:${discoveryProfile.profileId}`,
      `repo-intelligence:files:${files.length}`,
      `repo-intelligence:files-omitted:${discoveryProfile.filesOmittedCount}`,
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
    scanProfile: discoveryProfile,
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
