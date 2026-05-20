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
  const normalized = prompt.toLowerCase();
  const trimmed = prompt.trim();
  const hasQuestionShape =
    /[?？]$/.test(trimmed) ||
    normalized.startsWith("what ") ||
    normalized.startsWith("where ") ||
    /\b(what|where)\b/i.test(normalized) ||
    /(?:\u4ec0\u4e48|\u54ea\u91cc|\u5728\u54ea|\u54ea\u4e2a)/u.test(prompt);
  if (!hasQuestionShape) {
    return false;
  }

  const workspaceTerms =
    /\b(current|working)\s+(directory|dir|cwd)\b/i.test(normalized) ||
    /\bwhere\s+am\s+i\b/i.test(normalized) ||
    /\bwhat\s+is\s+the\s+current\s+workspace\b/i.test(normalized) ||
    /(?:\u5f53\u524d|\u73b0\u5728).*(?:\u5de5\u4f5c\u76ee\u5f55|\u76ee\u5f55|\u5de5\u4f5c\u533a)/u.test(
      prompt,
    );
  if (!workspaceTerms) {
    return false;
  }

  const hasMutationIntent =
    /\b(write|create|generate|save|edit|modify|update|fix|replace|patch)\b/i.test(
      normalized,
    ) ||
    /(?:\u5199|\u521b\u5efa|\u751f\u6210|\u4fdd\u5b58|\u4fee\u6539|\u66f4\u65b0|\u4fee\u590d|\u66ff\u6362)/u.test(
      prompt,
    );
  return !hasMutationIntent;
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
