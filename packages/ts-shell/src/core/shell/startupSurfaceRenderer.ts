import path from "node:path";
import type { StreamingRenderer } from "../../presentation/terminal/streaming.js";
import type {
  RecoveryTrustBoundaryBlock,
  SessionManager,
  SessionReentrySummary,
  WorkspaceRootMode,
} from "../../session/SessionManager.js";
import type {
  RootBindingDiagnostic,
  ShellRuntimeContext,
} from "./runtimeContext.js";

export type StartupSurfaceStdinTransportMode =
  | "none"
  | "capture-batch"
  | "stream-live";

export function renderWorkspaceBindingLines(
  renderer: StreamingRenderer,
  input: {
    requestedWorkspaceRoot?: string;
    projectRoot: string;
    rootMode: WorkspaceRootMode;
    targetPathBase: string;
    gitRoot: string | null;
    diagnostics?: readonly RootBindingDiagnostic[];
    gitContext: {
      insideGit: boolean;
      root: string | null;
    };
  },
): void {
  const requestedWorkspaceRoot =
    input.requestedWorkspaceRoot?.trim() || input.projectRoot;
  renderer.renderLine(`- Requested workspace: ${requestedWorkspaceRoot}`);
  renderer.renderLine(`- Target path base: ${input.targetPathBase}`);
  renderer.renderLine(`- Git root binding: ${input.gitRoot ?? "null"}`);
  renderer.renderLine(`- Root mode: ${input.rootMode}`);
  renderRootBindingDiagnostics(renderer, input.diagnostics ?? []);

  const requestedDiffersFromProject =
    normalizePathForCompare(requestedWorkspaceRoot) !==
    normalizePathForCompare(input.projectRoot);
  if (
    input.gitContext.insideGit &&
    input.gitContext.root &&
    requestedDiffersFromProject
  ) {
    renderer.renderLine(
      `- Root resolution: git-root auto-upgrade (${requestedWorkspaceRoot} -> ${input.projectRoot})`,
    );
    renderer.renderLine(
      "- Workspace note: relative file targets are resolved from the project root above, not from the requested subdirectory.",
    );
    renderer.renderLine(
      "- Workspace policy: repo subdirectories are not treated as independent project roots by default.",
    );
    renderer.renderLine(
      "- Workspace next action: use a path relative to the project root, attach a directory outside this git repo, or use a future explicit subdir workspace mode when available.",
    );
    return;
  }

  renderer.renderLine(
    input.gitContext.insideGit
      ? "- Root resolution: requested workspace is the git project root"
      : "- Root resolution: requested workspace is used directly (not inside git)",
  );
}

export function renderRootBindingDiagnostics(
  renderer: StreamingRenderer,
  diagnostics: readonly RootBindingDiagnostic[],
): void {
  if (diagnostics.length === 0) {
    return;
  }
  renderer.renderLine("- Root binding diagnostics:");
  for (const diagnostic of diagnostics) {
    renderer.renderLine(
      `  - ${diagnostic.severity}:${diagnostic.code}: ${diagnostic.explanation}`,
    );
    renderer.renderLine(`    nextAction: ${diagnostic.nextAction}`);
  }
}

export function renderStartupSurface(
  renderer: StreamingRenderer,
  input: {
    runtimeContext: ShellRuntimeContext;
    sessionManager: SessionManager;
    lifecycleNotices: readonly string[];
    recoveryCandidate?: { id: string } | null;
    recoveryCandidateSummary?: SessionReentrySummary;
    recoveryBlockedNotice?: RecoveryTrustBoundaryBlock;
    provider: string;
    model?: string;
    maxTurns: number;
    executionPath: "ts-local";
    stdinTransportMode: StartupSurfaceStdinTransportMode;
  },
): void {
  const summary = input.sessionManager.describeSessionReentry(
    input.runtimeContext.session.id,
  );
  const projectLabel =
    path.basename(input.runtimeContext.projectRoot) ||
    input.runtimeContext.projectRoot;

  renderer.renderLine("\nCheers Shell");
  renderer.renderLine(`- Project: ${projectLabel}`);
  renderer.renderLine(`- Project root: ${input.runtimeContext.projectRoot}`);
  renderWorkspaceBindingLines(renderer, {
    requestedWorkspaceRoot: input.runtimeContext.requestedWorkspaceRoot,
    projectRoot: input.runtimeContext.projectRoot,
    rootMode: input.runtimeContext.rootMode,
    targetPathBase: input.runtimeContext.targetPathBase,
    gitRoot: input.runtimeContext.gitRoot,
    diagnostics: input.runtimeContext.rootBindingDiagnostics,
    gitContext: input.runtimeContext.gitContext,
  });
  if (
    path.resolve(input.runtimeContext.originalCwd) !==
    path.resolve(input.runtimeContext.projectRoot)
  ) {
    renderer.renderLine(
      `- Launch directory: ${input.runtimeContext.originalCwd}`,
    );
  }
  renderer.renderLine(`- Session: ${summary.id} [${summary.status}]`);
  renderer.renderLine(
    `- Resume state: ${summary.resumeDisposition}${summary.autoResumeReady ? " (auto)" : ""}`,
  );
  renderer.renderLine(
    `- Runtime: ${input.executionPath}; provider=${input.provider}${input.model ? `; model=${input.model}` : ""}; max-turns=${input.maxTurns}`,
  );
  if (input.runtimeContext.gitContext.insideGit) {
    renderer.renderLine(
      `- Git: ${input.runtimeContext.gitContext.branch ?? "unknown"} (${input.runtimeContext.gitContext.isClean ? "clean" : "dirty"})`,
    );
  }

  const lifecycleNotice = input.lifecycleNotices.at(-1);
  if (lifecycleNotice) {
    renderer.renderLine(`- Session lifecycle: ${lifecycleNotice}`);
  }
  if (input.recoveryCandidate && input.recoveryCandidateSummary) {
    renderer.renderLine(
      `- Recovery hint: /resume or --session-id ${input.recoveryCandidate.id} (${input.recoveryCandidateSummary.resumeDisposition})`,
    );
  } else if (input.recoveryBlockedNotice) {
    renderer.renderLine(
      `- Recovery boundary: ${truncate(input.recoveryBlockedNotice.detail, 180)}`,
    );
  }

  renderer.renderLine("Next actions:");
  renderer.renderLine("- Type a prompt to start work in this project.");
  renderer.renderLine("- /resume             inspect sessions or continue work.");
  renderer.renderLine("- /workspace status   verify project/workdir binding.");
  renderer.renderLine("- /help               open grouped command navigation.");
  if (input.stdinTransportMode === "stream-live") {
    renderer.renderLine(
      "- Non-TTY stream mode active: each input line is processed as a sequential turn.",
    );
  }
  renderer.renderLine("Ctrl+C cancels the current run. Ctrl+D exits.\n");
}

function truncate(value: string, max: number): string {
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, max)}...`;
}

function normalizePathForCompare(value: string): string {
  return path.resolve(value).toLowerCase();
}
