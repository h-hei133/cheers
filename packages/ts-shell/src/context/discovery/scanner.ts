import crypto from "node:crypto";
import type { Dirent } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { safeTargetLabel } from "../../orchestration/workspaceFileContract.js";
import type {
  DiscoveredRepoFiles,
  RepoIntelligenceFile,
  RepoIntelligenceSnapshot,
  RepoScanProfile,
} from "./types.js";
import {
  classifyFileRole,
  countOverlap,
  IGNORED_DIRS,
  PATH_PRIORITY_PREFILL_LIMIT,
  PATH_PRIORITY_SCAN_LIMIT,
  scorePathPriority,
  tokenize,
} from "./scorer.js";

export function buildSnapshotId(input: object): string {
  return `repo_intel_${crypto.createHash("sha256").update(JSON.stringify(input)).digest("hex").slice(0, 12)}`;
}

export function normalizeRelative(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.$/, "");
}

export function isSupportedRepoFile(fileName: string): boolean {
  return /\.(?:ts|tsx|js|jsx|json|md|yaml|yml)$/i.test(fileName);
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function readDir(directory: string): Promise<Dirent[]> {
  try {
    return await fs.readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }
}

export async function readTextPrefix(filePath: string, length: number): Promise<string> {
  try {
    const content = await fs.readFile(filePath, "utf8");
    return content.slice(0, length);
  } catch {
    return "";
  }
}

export function extractSymbolHints(content: string, relativePath: string): readonly string[] {
  const matches = [
    ...content.matchAll(/\bexport\s+(?:async\s+)?(?:function|class|const|let|var|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g),
    ...content.matchAll(/\b(?:function|class)\s+([A-Za-z_$][\w$]*)/g),
    ...content.matchAll(/\bdescribe\(["'`]([^"'`]+)["'`]/g),
    ...content.matchAll(/"([A-Za-z0-9:_-]{4,})"\s*:/g),
  ].map((match) => match[1]).filter((value): value is string => Boolean(value));
  return Array.from(new Set([...matches, path.parse(relativePath).name])).slice(0, 10);
}

export function findPackageName(
  relativePath: string,
  packageMap: RepoIntelligenceSnapshot["packageMap"],
): string | undefined {
  return packageMap
    .filter((pkg) => relativePath === pkg.path || relativePath.startsWith(`${path.dirname(pkg.path)}/`))
    .sort((left, right) => right.path.length - left.path.length)[0]?.name;
}

export function isSourcePreferredDirectory(firstSegment: string, relativePath: string): boolean {
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

export function repoEntryPriority(input: {
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

export function sortRepoEntries(input: {
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

export async function discoverPackageMap(workspaceRoot: string): Promise<RepoIntelligenceSnapshot["packageMap"]> {
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

export async function discoverPathPriorityFilePaths(input: {
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

export async function discoverRepoFiles(input: {
  readonly workspaceRoot: string;
  readonly userTask: string;
  readonly maxFiles: number;
  readonly packageMap: RepoIntelligenceSnapshot["packageMap"];
  readonly scanProfile: RepoScanProfile;
}): Promise<DiscoveredRepoFiles> {
  const files: RepoIntelligenceFile[] = [];
  const seen = new Set<string>();
  const omissions = new Map<string, { count: number; examples: string[] }>();
  let filesConsideredCount = 0;
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
    profile: input.scanProfile,
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
      profile: input.scanProfile,
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
