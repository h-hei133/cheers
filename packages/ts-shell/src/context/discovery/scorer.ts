import path from "node:path";
import type { RepoIntelligenceFileRole, RepoScanProfile } from "./types.js";

/**
 * Directories a repository scan never descends into.
 *
 * Only build output is named. Tool state lives in dot-directories, and there is
 * one of those for every tool anyone might have run here — enumerating them means
 * the list is wrong the moment a new tool appears, so {@link isIgnoredDir} skips
 * the whole shape instead.
 */
export const IGNORED_DIRS = new Set([
  "coverage",
  "dist",
  "node_modules",
  "target",
]);

/** Whether a scan should skip `name`: build output, or any tool's state. */
export function isIgnoredDir(name: string): boolean {
  return name.startsWith(".") || IGNORED_DIRS.has(name);
}

export const PATH_PRIORITY_PREFILL_LIMIT = 96;
export const PATH_PRIORITY_SCAN_LIMIT = 5_000;
export const WEAK_CANDIDATE_SCORE_THRESHOLD = 50;

export const STOP_WORDS = new Set([
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

export function tokenize(value: string): string[] {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3)
    .filter((token) => !STOP_WORDS.has(token));
}

export function countOverlap(left: readonly string[], right: readonly string[]): number {
  const rightSet = new Set(right);
  return Array.from(new Set(left)).filter((token) => rightSet.has(token)).length;
}

export function buildRepoScanProfile(task: string): RepoScanProfile {
  const lower = task.toLowerCase();
  const codeLike = /\b(bug|fix|feature|implement|edit|change|test|spec|verify|runtime|orchestration|package|packages|src|source)\b/.test(lower);
  const docsLike = /\b(doc|docs|readme|explain|route|plan)\b/.test(lower) && !codeLike;
  return {
    tokens: tokenize(task),
    codeLike,
    docsLike,
  };
}

export function scorePathPriority(
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

export function pathPriorityRoleBoost(
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

export function classifyFileRole(relativePath: string): RepoIntelligenceFileRole {
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

export function classifyTaskBoosts(task: string): Record<RepoIntelligenceFileRole, number> {
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

export function isEditLikeTask(task: string): boolean {
  return /\b(edit|change|update|fix|implement|add|remove|refactor)\b/.test(task.toLowerCase());
}
