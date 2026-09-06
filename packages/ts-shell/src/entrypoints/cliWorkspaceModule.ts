import fs from "node:fs";
import path from "node:path";
import {
  createWorkspaceAttachSwitchDiagnostic,
  switchActiveSession,
  type RootBindingDiagnostic,
  type ShellRuntimeContext,
} from "../core/shell/runtimeContext.js";
import { resolveRootBindingDiagnostics } from "../core/shell/runtimeContext.js";
import { StreamingRenderer } from "../renderer/StreamingRenderer.js";
import type { WorkspaceRootMode } from "../session/SessionManager.js";
import { SessionManager } from "../session/SessionManager.js";
import { getWorkflowGitContext } from "../workflow/gitContext.js";
import {
  renderRecentProjectContexts,
  renderWorkspaceSummary,
} from "./cliWorkspaceSurface.js";

export function runCliWorkspaceCommand(input: {
  readonly renderer: StreamingRenderer;
  readonly sessionManager: SessionManager;
  readonly runtimeContext: ShellRuntimeContext;
  readonly workspaceAction?: "status" | "attach" | "recent";
  readonly workspaceTarget?: string;
  readonly printMode: boolean;
  readonly onProjectContextSwitched?: () => void;
}): void {
  const workspaceAction = input.workspaceAction ?? "status";
  if (workspaceAction === "recent") {
    renderRecentProjectContexts(
      input.renderer,
      input.sessionManager.listRecentProjectContexts(8),
    );
    return;
  }

  if (workspaceAction === "attach") {
    runCliWorkspaceAttach(input);
    return;
  }

  renderWorkspaceSummary(input.renderer, input.runtimeContext);
}

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
  return path.resolve(value).toLowerCase();
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

function runCliWorkspaceAttach(input: {
  readonly renderer: StreamingRenderer;
  readonly sessionManager: SessionManager;
  readonly runtimeContext: ShellRuntimeContext;
  readonly workspaceTarget?: string;
  readonly printMode: boolean;
  readonly onProjectContextSwitched?: () => void;
}): void {
  const attachTarget = input.workspaceTarget?.trim();
  if (!attachTarget) {
    input.renderer.renderLine(
      input.printMode ? "Usage: /workspace attach <path>" : "\nUsage: /workspace attach <path>\n",
    );
    return;
  }

  try {
    const attached = resolveRuntimeProjectRoot(
      input.runtimeContext.cwd,
      attachTarget,
    );
    const previousProjectRoot = input.runtimeContext.projectRoot;
    const attachDiagnostics =
      normalizePathForCompare(previousProjectRoot) ===
      normalizePathForCompare(attached.projectRoot)
        ? attached.rootBindingDiagnostics
        : [
            ...attached.rootBindingDiagnostics,
            createWorkspaceAttachSwitchDiagnostic({
              currentProjectRoot: previousProjectRoot,
              requestedWorkspaceRoot: attached.requestedRoot,
              resolvedProjectRoot: attached.projectRoot,
            }),
          ];
    if (
      normalizePathForCompare(previousProjectRoot) ===
      normalizePathForCompare(attached.projectRoot)
    ) {
      input.sessionManager.updateSessionWorkspaceBinding(
        input.runtimeContext.session.id,
        {
          projectRoot: attached.projectRoot,
          rootMode: attached.rootMode,
          requestedWorkspaceRoot: attached.requestedRoot,
          targetPathBase: attached.targetPathBase,
          gitRoot: attached.gitRoot,
        },
      );
      input.runtimeContext.session.rootMode = attached.rootMode;
      input.runtimeContext.session.requestedWorkspaceRoot =
        attached.requestedRoot;
      input.runtimeContext.session.targetPathBase = attached.targetPathBase;
      input.runtimeContext.session.gitRoot = attached.gitRoot;
      switchActiveSession(
        input.runtimeContext,
        input.runtimeContext.session,
        attached.projectRoot,
        {
          cwd: attached.projectRoot,
          projectRoot: attached.projectRoot,
          rootMode: attached.rootMode,
          requestedWorkspaceRoot: attached.requestedRoot,
          targetPathBase: attached.targetPathBase,
          gitRoot: attached.gitRoot,
          rootBindingDiagnostics: attachDiagnostics,
          gitContext: attached.gitContext,
        },
      );
      input.renderer.renderLine(
        input.printMode
          ? `Already attached to ${attached.projectRoot}; requested path resolves to this project root.`
          : `\nAlready attached to ${attached.projectRoot}; requested path resolves to this project root.`,
      );
      renderWorkspaceSummary(input.renderer, input.runtimeContext);
      return;
    }

    const attachedSession = input.sessionManager.createNew(attached.projectRoot, {
      rootMode: attached.rootMode,
      requestedWorkspaceRoot: attached.requestedRoot,
      targetPathBase: attached.targetPathBase,
      gitRoot: attached.gitRoot,
    });
    switchActiveSession(input.runtimeContext, attachedSession, attached.projectRoot, {
      cwd: attached.projectRoot,
      projectRoot: attached.projectRoot,
      rootMode: attached.rootMode,
      requestedWorkspaceRoot: attached.requestedRoot,
      targetPathBase: attached.targetPathBase,
      gitRoot: attached.gitRoot,
      rootBindingDiagnostics: attachDiagnostics,
      gitContext: attached.gitContext,
    });

    input.renderer.renderLine(
      input.printMode
        ? `Attached project context: ${previousProjectRoot} -> ${attached.projectRoot}`
        : `\nAttached project context: ${previousProjectRoot} -> ${attached.projectRoot}`,
    );
    input.renderer.renderLine(`New project session: ${attachedSession.id}`);
    renderWorkspaceSummary(input.renderer, input.runtimeContext);
    renderRecentProjectContexts(
      input.renderer,
      input.sessionManager.listRecentProjectContexts(8),
    );
    input.onProjectContextSwitched?.();
  } catch (error) {
    input.renderer.renderLine(
      input.printMode
        ? `Failed to attach project: ${error instanceof Error ? error.message : String(error)}`
        : `\nFailed to attach project: ${error instanceof Error ? error.message : String(error)}\n`,
    );
  }
}
