import fs from "node:fs/promises";
import path from "node:path";

import {
  DEFAULT_CONTEXT_BUDGET_LIMITS,
  createContextBudgetState,
  readFileWithinContextBudget,
  type ContextBudgetDecision,
  type ContextBudgetLimits,
} from "./contextBudget.js";
import { safeTargetLabel } from "../../policy/workspaceFileContract.js";

export type ContextCandidateKind =
  | "target-file"
  | "direct-import"
  | "sibling-file"
  | "nearby-test"
  | "docs-readme"
  | "call-site";

export interface ContextDiscoveryCandidate {
  readonly kind: ContextCandidateKind;
  readonly path: string;
  readonly safeLabel: string;
  readonly relation: string;
  readonly score: number;
  readonly symbolHints: readonly string[];
}

export interface ContextDiscoveredSource extends ContextDiscoveryCandidate {
  readonly decision: ContextBudgetDecision;
  readonly byteLength: number;
  readonly redactionApplied: boolean;
  readonly summary?: string;
  readonly reason?: string;
}

export interface ContextDiscoveryResult {
  readonly targetPath: string;
  readonly targetLabel: string;
  readonly candidates: readonly ContextDiscoveryCandidate[];
  readonly sources: readonly ContextDiscoveredSource[];
  readonly budget: {
    readonly maxCandidateCount: number;
    readonly maxFilesRead: number;
    readonly maxBytesPerFile: number;
    readonly maxTotalBytes: number;
    readonly filesRead: number;
    readonly bytesUsed: number;
  };
  readonly evidence: readonly string[];
}

export async function discoverTargetedContext(input: {
  readonly workspaceRoot: string;
  readonly targetPath: string;
  readonly limits?: Partial<ContextBudgetLimits>;
}): Promise<ContextDiscoveryResult> {
  const workspaceRoot = path.resolve(input.workspaceRoot);
  const targetPath = path.isAbsolute(input.targetPath)
    ? path.resolve(input.targetPath)
    : path.resolve(workspaceRoot, input.targetPath);
  let state = createContextBudgetState(input.limits);
  const targetReadState = createContextBudgetState(targetReadLimits(input.limits));
  const targetLabel = safeTargetLabel(path.relative(workspaceRoot, targetPath) || targetPath);
  const seed: ContextDiscoveryCandidate = {
    kind: "target-file",
    path: targetPath,
    safeLabel: targetLabel,
    relation: "explicit target",
    score: 100,
    symbolHints: [],
  };

  const targetRead = await readFileWithinContextBudget({
    filePath: targetPath,
    workspaceRoot,
    state: targetReadState,
  });
  state = {
    ...state,
    filesRead: targetRead.state.filesRead,
    bytesUsed: targetRead.state.bytesUsed,
    includedCount: targetRead.state.includedCount,
  };
  const targetContent = targetRead.result.redactedContent ?? "";
  const symbolHints = targetRead.result.decision === "included"
    ? extractSymbolHints(targetContent, targetPath)
    : [];
  const candidates = dedupeCandidates([
    { ...seed, symbolHints },
    ...(targetRead.result.decision === "included"
      ? await discoverDirectImportCandidates({
          content: targetContent,
          targetPath,
          workspaceRoot,
          symbolHints,
        })
      : []),
    ...(await discoverSiblingCandidates({ targetPath, workspaceRoot, symbolHints })),
    ...(await discoverNearbyTestCandidates({ targetPath, workspaceRoot, symbolHints })),
    ...(await discoverDocsReadmeCandidates({ targetPath, workspaceRoot, symbolHints })),
    ...(await discoverCallSiteCandidates({ targetPath, workspaceRoot, symbolHints })),
  ])
    .sort((a, b) => b.score - a.score || a.safeLabel.localeCompare(b.safeLabel))
    .slice(0, state.limits.maxCandidateCount);

  const sources: ContextDiscoveredSource[] = [
    buildSourceFromRead(seed, targetRead.result, targetContent),
  ];
  for (const candidate of candidates.filter((item) => item.kind !== "target-file")) {
    const read = await readFileWithinContextBudget({
      filePath: candidate.path,
      workspaceRoot,
      state,
    });
    state = read.state;
    sources.push(
      buildSourceFromRead(candidate, read.result, read.result.redactedContent ?? ""),
    );
  }

  return {
    targetPath,
    targetLabel,
    candidates,
    sources,
    budget: {
      ...state.limits,
      filesRead: state.filesRead,
      bytesUsed: state.bytesUsed,
    },
    evidence: [
      "context-discovery:deterministic",
      `context-discovery:target:${targetLabel}`,
      `context-discovery:candidates:${candidates.length}`,
    ],
  };
}

function targetReadLimits(
  limits: Partial<ContextBudgetLimits> | undefined,
): Partial<ContextBudgetLimits> {
  if (limits?.maxBytesPerFile !== undefined) {
    return limits;
  }
  return {
    ...limits,
    maxBytesPerFile: DEFAULT_TARGET_FILE_CONTEXT_BYTES,
    maxTotalBytes: Math.max(
      limits?.maxTotalBytes ?? DEFAULT_CONTEXT_BUDGET_LIMITS.maxTotalBytes,
      DEFAULT_TARGET_FILE_CONTEXT_BYTES,
    ),
  };
}

const DEFAULT_TARGET_FILE_CONTEXT_BYTES = 48_000;

async function discoverDirectImportCandidates(input: {
  readonly content: string;
  readonly targetPath: string;
  readonly workspaceRoot: string;
  readonly symbolHints: readonly string[];
}): Promise<ContextDiscoveryCandidate[]> {
  const candidates: ContextDiscoveryCandidate[] = [];
  const imports = Array.from(
    input.content.matchAll(
      /(?:import|export)\s+(?:type\s+)?(?:[^"'`]+?\s+from\s+)?["']([^"']+)["']|require\(["']([^"']+)["']\)/g,
    ),
  )
    .map((match) => match[1] ?? match[2])
    .filter((specifier): specifier is string => Boolean(specifier))
    .filter((specifier) => specifier.startsWith("."));
  for (const specifier of imports) {
    const resolved = await resolveRelativeImport(input.targetPath, specifier);
    if (!resolved || !isWithin(input.workspaceRoot, resolved)) {
      continue;
    }
    candidates.push(candidate("direct-import", resolved, input.workspaceRoot, `import ${specifier}`, 80, input.symbolHints));
  }
  return candidates;
}

async function discoverSiblingCandidates(input: {
  readonly targetPath: string;
  readonly workspaceRoot: string;
  readonly symbolHints: readonly string[];
}): Promise<ContextDiscoveryCandidate[]> {
  const dir = path.dirname(input.targetPath);
  const entries = await readDirEntries(dir);
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(dir, entry.name))
    .filter((candidatePath) => candidatePath !== input.targetPath)
    .filter(isSupportedSourcePath)
    .slice(0, 8)
    .map((candidatePath) =>
      candidate("sibling-file", candidatePath, input.workspaceRoot, "same directory", 55, input.symbolHints),
    );
}

async function discoverNearbyTestCandidates(input: {
  readonly targetPath: string;
  readonly workspaceRoot: string;
  readonly symbolHints: readonly string[];
}): Promise<ContextDiscoveryCandidate[]> {
  const dir = path.dirname(input.targetPath);
  const parsed = path.parse(input.targetPath);
  const names = [
    `${parsed.name}.test${parsed.ext}`,
    `${parsed.name}.spec${parsed.ext}`,
    `${parsed.name}.test.ts`,
    `${parsed.name}.spec.ts`,
    `${parsed.name}.test.tsx`,
    `${parsed.name}.spec.tsx`,
  ];
  const paths = [
    ...names.map((name) => path.join(dir, name)),
    ...names.map((name) => path.join(dir, "__tests__", name)),
    ...names.map((name) => path.join(path.dirname(dir), "__tests__", name)),
  ];
  const existing = await filterExistingFiles(paths);
  return existing.map((candidatePath) =>
    candidate("nearby-test", candidatePath, input.workspaceRoot, "nearby test naming convention", 70, input.symbolHints),
  );
}

async function discoverDocsReadmeCandidates(input: {
  readonly targetPath: string;
  readonly workspaceRoot: string;
  readonly symbolHints: readonly string[];
}): Promise<ContextDiscoveryCandidate[]> {
  const docs: string[] = [];
  let current = path.dirname(input.targetPath);
  const workspaceRoot = path.resolve(input.workspaceRoot);
  while (isWithin(workspaceRoot, current)) {
    docs.push(path.join(current, "README.md"));
    if (path.resolve(current) === workspaceRoot) {
      break;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  const stem = path.parse(input.targetPath).name.toLowerCase();
  for (const docsDir of [
    path.join(workspaceRoot, "docs"),
    path.join(path.dirname(input.targetPath), "docs"),
  ]) {
    const entries = await readDirEntries(docsDir);
    for (const entry of entries) {
      if (entry.isFile() && entry.name.toLowerCase().includes(stem) && entry.name.endsWith(".md")) {
        docs.push(path.join(docsDir, entry.name));
      }
    }
  }
  const existing = await filterExistingFiles(docs);
  return existing.map((candidatePath) =>
    candidate("docs-readme", candidatePath, input.workspaceRoot, "readme/docs reference", 45, input.symbolHints),
  );
}

async function discoverCallSiteCandidates(input: {
  readonly targetPath: string;
  readonly workspaceRoot: string;
  readonly symbolHints: readonly string[];
}): Promise<ContextDiscoveryCandidate[]> {
  const hints = input.symbolHints.length > 0
    ? input.symbolHints
    : [path.parse(input.targetPath).name];
  const searchDirs = Array.from(
    new Set([path.dirname(input.targetPath), path.dirname(path.dirname(input.targetPath))]),
  );
  const candidates: ContextDiscoveryCandidate[] = [];
  for (const dir of searchDirs) {
    const entries = await readDirEntries(dir);
    for (const entry of entries) {
      const candidatePath = path.join(dir, entry.name);
      if (!entry.isFile() || candidatePath === input.targetPath || !isSupportedSourcePath(candidatePath)) {
        continue;
      }
      const text = await readTextPrefix(candidatePath, 12_000);
      if (!text) {
        continue;
      }
      const matched = hints.find((hint) => hint.length >= 3 && text.includes(hint));
      if (matched) {
        candidates.push(
          candidate("call-site", candidatePath, input.workspaceRoot, `textual reference ${matched}`, 60, [matched]),
        );
      }
    }
  }
  return candidates.slice(0, 6);
}

function buildSourceFromRead(
  candidate: ContextDiscoveryCandidate,
  read: {
    readonly decision: ContextBudgetDecision;
    readonly byteLength: number;
    readonly redactionApplied: boolean;
    readonly reason?: string;
  },
  content: string,
): ContextDiscoveredSource {
  return {
    ...candidate,
    decision: read.decision,
    byteLength: read.byteLength,
    redactionApplied: read.redactionApplied,
    ...(read.reason ? { reason: read.reason } : {}),
    ...(read.decision === "included" ? { summary: summarizeFile(content) } : {}),
  };
}

function summarizeFile(content: string): string {
  const lines = content.split(/\r?\n/);
  const nonEmpty = lines.filter((line) => line.trim().length > 0);
  const exports = extractSymbolHints(content, "");
  const imports = Array.from(content.matchAll(/\bimport\b|\brequire\(/g)).length;
  return [
    `lines=${lines.length}`,
    `nonEmpty=${nonEmpty.length}`,
    `imports=${imports}`,
    exports.length > 0 ? `symbols=${exports.slice(0, 6).join(",")}` : "symbols=(none)",
  ].join(" ");
}

function extractSymbolHints(content: string, targetPath: string): string[] {
  const exported = Array.from(
    content.matchAll(
      /\bexport\s+(?:async\s+)?(?:function|class|const|let|var|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g,
    ),
  ).map((match) => match[1]);
  const declarations = Array.from(
    content.matchAll(/\b(?:function|class)\s+([A-Za-z_$][\w$]*)/g),
  ).map((match) => match[1]);
  return Array.from(
    new Set([
      ...exported,
      ...declarations,
      ...(targetPath ? [path.parse(targetPath).name] : []),
    ].filter((value): value is string => Boolean(value))),
  ).slice(0, 12);
}

async function resolveRelativeImport(
  fromPath: string,
  specifier: string,
): Promise<string | undefined> {
  const resolvedSpecifier = specifier.replace(/\.(?:js|jsx)$/i, "");
  const base = path.resolve(path.dirname(fromPath), resolvedSpecifier);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.jsx`,
    `${base}.json`,
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
    path.join(base, "index.js"),
  ];
  const existing = await filterExistingFiles(candidates);
  return existing[0];
}

function candidate(
  kind: ContextCandidateKind,
  candidatePath: string,
  workspaceRoot: string,
  relation: string,
  score: number,
  symbolHints: readonly string[],
): ContextDiscoveryCandidate {
  return {
    kind,
    path: candidatePath,
    safeLabel: safeTargetLabel(path.relative(workspaceRoot, candidatePath) || candidatePath),
    relation,
    score,
    symbolHints,
  };
}

function dedupeCandidates(
  candidates: readonly ContextDiscoveryCandidate[],
): ContextDiscoveryCandidate[] {
  const byPath = new Map<string, ContextDiscoveryCandidate>();
  for (const item of candidates) {
    const key = path.resolve(item.path);
    const existing = byPath.get(key);
    if (!existing || item.score > existing.score) {
      byPath.set(key, item);
    }
  }
  return Array.from(byPath.values());
}

async function filterExistingFiles(paths: readonly string[]): Promise<string[]> {
  const existing: string[] = [];
  for (const candidatePath of Array.from(new Set(paths.map((item) => path.resolve(item))))) {
    try {
      const stat = await fs.stat(candidatePath);
      if (stat.isFile()) {
        existing.push(candidatePath);
      }
    } catch {
      // Missing candidates are expected in deterministic discovery.
    }
  }
  return existing.sort();
}

async function readDirEntries(dir: string): Promise<import("node:fs").Dirent[]> {
  try {
    return await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

async function readTextPrefix(filePath: string, maxChars: number): Promise<string | undefined> {
  try {
    const content = await fs.readFile(filePath, "utf8");
    return content.slice(0, maxChars);
  } catch {
    return undefined;
  }
}

function isSupportedSourcePath(filePath: string): boolean {
  return /\.(?:ts|tsx|js|jsx|json|md|txt|yaml|yml|toml)$/i.test(filePath);
}

function isWithin(root: string, candidatePath: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidatePath));
  return relative.length === 0 || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
