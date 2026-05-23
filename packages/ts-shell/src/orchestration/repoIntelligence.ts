import crypto from "node:crypto";
import type { Dirent } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

import { safeTargetLabel } from "./workspaceFileContract.js";

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
  readonly path: string;
  readonly safeLabel: string;
  readonly role: RepoIntelligenceFileRole;
  readonly score: number;
  readonly reasons: readonly string[];
  readonly symbolHints: readonly string[];
  readonly freshness: "fresh-stat" | "unknown";
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
  readonly cacheStatus: "disabled" | "enabled-not-used";
  readonly staleIndexWarnings: readonly string[];
  readonly evidence: readonly string[];
}

export interface RepoIntelligenceResult {
  readonly snapshot: RepoIntelligenceSnapshot;
  readonly candidates: readonly RepoIntelligenceCandidate[];
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
  const files = await discoverRepoFiles({ workspaceRoot, maxFiles, packageMap });
  const moduleMap = buildModuleMap(files);
  const snapshotId = buildSnapshotId({ packageMap, files });
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
    cacheStatus: input.cache?.enabled ? "enabled-not-used" : "disabled",
    staleIndexWarnings: input.cache?.enabled ? ["persistent cache read/write is not implemented by default"] : [],
    evidence: [
      `repo-intelligence:snapshot:${snapshotId}`,
      `repo-intelligence:files:${files.length}`,
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
  const missingFacts =
    candidates.length === 0
      ? ["no candidate files matched the vague task within the bounded repository scan"]
      : [];
  const nextReadSuggestions =
    candidates.length > 0
      ? candidates.slice(0, 4).map((candidate) => candidate.safeLabel)
      : snapshot.entrypointMap.slice(0, 4);

  return {
    snapshot,
    candidates,
    recentRelevantFiles: candidates.slice(0, 5).map((candidate) => candidate.safeLabel),
    missingFacts,
    nextReadSuggestions,
    evidence: [
      ...snapshot.evidence,
      `repo-intelligence:candidates:${candidates.length}`,
      ...candidates.slice(0, 3).map((candidate) => `repo-intelligence:candidate:${candidate.safeLabel}`),
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
  return input.files
    .map((file) => {
      const pathTokens = tokenize(file.path);
      const symbolTokens = file.symbolHints.flatMap(tokenize);
      const overlap = countOverlap(tokens, [...pathTokens, ...symbolTokens]);
      const roleBoost = actionBoosts[file.role] ?? 0;
      const scriptBoost = file.path === "package.json" && tokens.some((token) => ["script", "test", "build"].includes(token)) ? 28 : 0;
      const exactNameBoost = tokens.some((token) => path.basename(file.path).toLowerCase().includes(token)) ? 18 : 0;
      const score = overlap * 14 + roleBoost + scriptBoost + exactNameBoost + freshnessBoost(file);
      const reasons = [
        overlap > 0 ? `task-token-overlap:${overlap}` : undefined,
        roleBoost > 0 ? `role:${file.role}` : undefined,
        scriptBoost > 0 ? "package-script-query" : undefined,
        exactNameBoost > 0 ? "path-name-match" : undefined,
      ].filter((reason): reason is string => Boolean(reason));
      return {
        path: file.path,
        safeLabel: file.safeLabel,
        role: file.role,
        score,
        reasons,
        symbolHints: file.symbolHints,
        freshness: "fresh-stat" as const,
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

async function discoverRepoFiles(input: {
  readonly workspaceRoot: string;
  readonly maxFiles: number;
  readonly packageMap: RepoIntelligenceSnapshot["packageMap"];
}): Promise<RepoIntelligenceFile[]> {
  const files: RepoIntelligenceFile[] = [];
  const visit = async (directory: string): Promise<void> => {
    if (files.length >= input.maxFiles) {
      return;
    }
    const entries = await readDir(directory);
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (files.length >= input.maxFiles) {
        return;
      }
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) {
          await visit(absolutePath);
        }
        continue;
      }
      if (!entry.isFile() || !isSupportedRepoFile(entry.name)) {
        continue;
      }
      const relativePath = normalizeRelative(path.relative(input.workspaceRoot, absolutePath));
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
    }
  };
  await visit(input.workspaceRoot);
  return files;
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
  const editLike = /\b(edit|change|update|fix|implement|add|remove|refactor)\b/.test(lower);
  const testLike = /\b(test|spec|verify|failing|failure|regression)\b/.test(lower);
  return {
    entrypoint: /\b(cli|command|start|entry|flag)\b/.test(lower) ? 34 : 8,
    test: testLike ? (editLike ? 18 : 40) : 4,
    config: /\b(config|script|package|build|tsconfig|eslint|vitest)\b/.test(lower) ? 36 : 2,
    docs: /\b(doc|readme|route|plan|explain)\b/.test(lower) ? 30 : 2,
    source: /\b(bug|fix|feature|implement|route|runtime|context|plan|edit|target)\b/.test(lower) ? (editLike ? 38 : 24) : 10,
  };
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
    .toLowerCase()
    .replace(/([a-z])([A-Z])/g, "$1 $2")
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
  ".git",
  ".sisyphus",
  ".turbo",
  "coverage",
  "dist",
  "node_modules",
  "target",
]);

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
