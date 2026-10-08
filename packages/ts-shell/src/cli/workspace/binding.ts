import fs from 'node:fs';
import path from 'node:path';
import { normalizePathIdentity } from '../../session/continuation/roots.js';
import { resolveRootBindingDiagnostics, type RootBindingDiagnostic } from '../../core/shell/runtimeContext.js';
import type { WorkspaceRootMode } from '../../session/SessionManager.js';
import { getWorkflowGitContext } from '../../workflow/gitContext.js';

export function isWorkspaceInfoPromptStrict(prompt: string): boolean {
  const normalized = prompt.toLowerCase().trim();

  // Only match pure workspace path queries (e.g., "pwd", "where am i", "当前工作目录是什么", "what is the current directory")
  const pureDirectoryQueries = [
    "pwd",
    "cwd",
    "where am i",
    "where am i?",
    "what is current directory",
    "what is current directory?",
    "what is the current directory",
    "what is the current directory?",
    "what is the current workspace",
    "what is the current workspace?",
    "当前目录是什么",
    "当前目录是什么？",
    "当前工作目录是什么",
    "当前工作目录是什么？",
    "当前工作区是什么",
    "当前工作区是什么？",
    "当前目录在哪里",
    "当前目录在哪里？",
    "当前工作目录在哪里",
    "当前工作目录在哪里？",
    "当前工作区在哪里",
    "当前工作区在哪里？",
  ];
  if (pureDirectoryQueries.includes(normalized)) {
    return true;
  }

  // If prompt asks to analyze, explain, look, fix, read, etc., it must ALWAYS pass to the agent loop
  const complexTaskVerbs =
    /(?:\u5206\u6790|\u770b\u4e00\u4e0b|\u4ecb\u7ecd|\u89e3\u6790|\u67e5\u770b|\u641c\u7d22|\u67b6\u6784|\u4ee3\u7801|\u9879\u76ee|analyze|explain|explore|check|overview|architecture|structure|summary)/i;
  if (complexTaskVerbs.test(prompt)) {
    return false;
  }

  const isStrictShortQuery =
    /^(?:what|where)\s+(?:is\s+)?(?:the\s+)?(?:current\s+)?(?:directory|cwd|workspace)\s*[?？]?$/i.test(
      normalized,
    ) ||
    /^(?:\u5f53\u524d|\u73b0\u5728)(?:\u7684)?(?:\u5de5\u4f5c)?(?:\u76ee\u5f55|\u5de5\u4f5c\u533a)(?:\u662f(?:\u4ec0\u4e48|\u54ea\u91cc)|\u5728\u54ea)\s*[?？]?$/u.test(
      prompt.trim(),
    );

  return isStrictShortQuery;
}

export function normalizePathForCompare(value: string): string {
  return normalizePathIdentity(value) ?? '';
}

export function resolveRuntimeProjectRoot(
  baseCwd: string,
  requestedProjectPath: string,
): {
  requestedRoot: string;
  projectRoot: string;
  rootMode: WorkspaceRootMode;
  targetPathBase: string;
  gitRoot: string | null;
  rootBindingDiagnostics: readonly RootBindingDiagnostic[];
  gitContext: ReturnType<typeof getWorkflowGitContext>;
} {
  const requestedPath = requestedProjectPath.trim();
  if (!requestedPath) {
    throw new Error("Project path cannot be empty.");
  }

  const resolvedPath = path.resolve(baseCwd, requestedPath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Target project does not exist: ${resolvedPath}`);
  }

  const stat = fs.statSync(resolvedPath);
  if (!stat.isDirectory()) {
    throw new Error(`Target project must be a directory: ${resolvedPath}`);
  }

  const gitContext = getWorkflowGitContext(resolvedPath);
  const projectRoot = gitContext.root ?? resolvedPath;
  const rootMode = resolveWorkspaceRootMode(gitContext);
  const targetPathBase = projectRoot;
  const gitRoot = gitContext.root ?? null;
  return {
    requestedRoot: resolvedPath,
    projectRoot,
    rootMode,
    targetPathBase,
    gitRoot,
    rootBindingDiagnostics: resolveRootBindingDiagnostics({
      projectRoot,
      rootMode,
      requestedWorkspaceRoot: resolvedPath,
      targetPathBase,
      gitRoot,
      gitContext,
    }),
    gitContext,
  };
}

export function resolveWorkspaceRootMode(
  gitContext: ReturnType<typeof getWorkflowGitContext>,
): WorkspaceRootMode {
  return gitContext.insideGit && gitContext.root ? "git-root" : "direct";
}

export function resolveTargetProjectRoot(
  launchCwd: string,
  requestedProjectPath?: string,
): string {
  if (!requestedProjectPath?.trim()) {
    return launchCwd;
  }

  const resolvedPath = path.resolve(launchCwd, requestedProjectPath.trim());
  if (!fs.existsSync(resolvedPath)) {
    console.error(`Target project does not exist: ${resolvedPath}`);
    process.exit(1);
  }

  const stat = fs.statSync(resolvedPath);
  if (!stat.isDirectory()) {
    console.error(`Target project must be a directory: ${resolvedPath}`);
    process.exit(1);
  }

  return resolvedPath;
}
