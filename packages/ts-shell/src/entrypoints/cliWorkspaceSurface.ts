import path from "node:path";
import { renderWorkspaceBindingLines } from "../core/shell/startupSurfaceRenderer.js";
import type { ShellRuntimeContext } from "../core/shell/runtimeContext.js";
import type { StreamingRenderer } from "../presentation/terminal/streaming.js";
import type { ProjectContextSummary } from "../session/SessionManager.js";

export interface WorkspaceCliLineRenderer {
  renderLine(line: string): void;
}

export type WorkspaceCliLine = string;

export function renderWorkspaceSummary(
  renderer: WorkspaceCliLineRenderer,
  runtimeContext: ShellRuntimeContext,
): void {
  renderer.renderLine("\nWorkspace");
  renderer.renderLine(
    `- Project: ${path.basename(runtimeContext.projectRoot) || runtimeContext.projectRoot}`,
  );
  renderer.renderLine(`- Project root: ${runtimeContext.projectRoot}`);
  renderer.renderLine(`- Working directory: ${runtimeContext.cwd}`);
  renderer.renderLine(
    `- Original launch directory: ${runtimeContext.originalCwd}`,
  );
  renderWorkspaceBindingLines(renderer as StreamingRenderer, {
    requestedWorkspaceRoot: runtimeContext.requestedWorkspaceRoot,
    projectRoot: runtimeContext.projectRoot,
    rootMode: runtimeContext.rootMode,
    targetPathBase: runtimeContext.targetPathBase,
    gitRoot: runtimeContext.gitRoot,
    diagnostics: runtimeContext.rootBindingDiagnostics,
    gitContext: runtimeContext.gitContext,
  });
  if (runtimeContext.gitContext.insideGit) {
    renderer.renderLine(
      `- Git root: ${runtimeContext.gitContext.root ?? "unknown"}`,
    );
    renderer.renderLine(
      `- Branch: ${runtimeContext.gitContext.branch ?? "unknown"}`,
    );
    renderer.renderLine(
      `- Workspace clean: ${runtimeContext.gitContext.isClean ? "yes" : "no"}`,
    );
  } else {
    renderer.renderLine("- Git: not inside a git workspace");
  }
  renderer.renderLine(
    `- Active session: ${runtimeContext.session.id} [${runtimeContext.session.status}]`,
  );
  renderer.renderLine(
    `- Session project binding: ${runtimeContext.session.projectRoot}`,
  );
  renderer.renderLine(
    "Next actions: /workspace recent, /workspace attach <path>, /resume",
  );
  renderer.renderLine("");
}

export function renderRecentProjectContexts(
  renderer: WorkspaceCliLineRenderer,
  projectContexts: readonly ProjectContextSummary[],
): void {
  renderer.renderLine("\nRecent project contexts");
  if (projectContexts.length === 0) {
    renderer.renderLine("- No project contexts found yet.");
    renderer.renderLine(
      "- Start with /workspace attach <path> to bind a target project.",
    );
    renderer.renderLine("");
    return;
  }

  for (const projectContext of projectContexts) {
    const projectLabel =
      path.basename(projectContext.projectRoot) || projectContext.projectRoot;
    const recoverableLabel =
      projectContext.recoverableCount > 0
        ? `${projectContext.recoverableCount} recoverable`
        : "no recoverable runs";
    renderer.renderLine(
      `- ${projectLabel}  sessions=${projectContext.sessionCount}  ${recoverableLabel}  updated=${toRelativeTime(projectContext.lastUpdatedAt)}  last=${projectContext.lastSessionId}`,
    );
  }
  renderer.renderLine(
    "Attach quickly with /workspace attach <path>. Resume the last interrupted run with /resume after switching project context.",
  );
  renderer.renderLine("");
}

function toRelativeTime(iso: string): string {
  const updatedAt = new Date(iso).getTime();
  if (!Number.isFinite(updatedAt)) {
    return "unknown";
  }

  const deltaSeconds = Math.max(0, Math.floor((Date.now() - updatedAt) / 1000));
  if (deltaSeconds < 60) {
    return `${deltaSeconds}s ago`;
  }
  const deltaMinutes = Math.floor(deltaSeconds / 60);
  if (deltaMinutes < 60) {
    return `${deltaMinutes}m ago`;
  }
  const deltaHours = Math.floor(deltaMinutes / 60);
  if (deltaHours < 24) {
    return `${deltaHours}h ago`;
  }
  const deltaDays = Math.floor(deltaHours / 24);
  return `${deltaDays}d ago`;
}
