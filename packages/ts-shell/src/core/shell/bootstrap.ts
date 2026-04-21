import * as fs from "node:fs";
import * as path from "node:path";
import type { StreamingRenderer } from "../../renderer/StreamingRenderer.js";
import type { ResumeResult, SessionManager } from "../../session/SessionManager.js";
import type { RuntimeConfig } from "../../config/runtimeConfig.js";
import type { WorkflowGitContext } from "../../workflow/gitContext.js";
import { createShellRuntimeContext, type ShellRuntimeContext } from "./runtimeContext.js";
import { getWorkflowGitContext } from "../../workflow/gitContext.js";
import type { SessionResumeProvenance } from "./runtimeContext.js";

export class SessionBootstrapError extends Error {
  readonly hint?: string;

  constructor(message: string, hint?: string) {
    super(message);
    this.name = "SessionBootstrapError";
    this.hint = hint;
  }
}

function isFailedResume(
  result: ResumeResult,
): result is Extract<ResumeResult, { ok: false }> {
  return result.ok === false;
}

type ProjectRootConflictDecision =
  | { disposition: "safe" }
  | { disposition: "warn"; detail: string }
  | { disposition: "block"; detail: string; hint: string };

function normalizeRootPath(root: string): string {
  const resolved = path.resolve(root);
  let realPath = resolved;
  try {
    realPath = fs.realpathSync.native(resolved);
  } catch {
    realPath = resolved;
  }
  return process.platform === "win32" ? realPath.toLowerCase() : realPath;
}

function isPathWithin(base: string, candidate: string): boolean {
  if (base === candidate) {
    return true;
  }
  const separator = process.platform === "win32" ? "\\" : "/";
  return candidate.startsWith(`${base}${separator}`);
}

function evaluateProjectRootConflict(
  sessionRoot: string,
  requestedRoot: string,
): ProjectRootConflictDecision {
  const normalizedSessionRoot = normalizeRootPath(sessionRoot);
  const normalizedRequestedRoot = normalizeRootPath(requestedRoot);

  if (normalizedSessionRoot === normalizedRequestedRoot) {
    return { disposition: "safe" };
  }

  const sessionGit = getWorkflowGitContext(sessionRoot);
  const requestedGit = getWorkflowGitContext(requestedRoot);
  const sessionGitRoot = sessionGit.root ? normalizeRootPath(sessionGit.root) : null;
  const requestedGitRoot = requestedGit.root
    ? normalizeRootPath(requestedGit.root)
    : null;
  if (
    sessionGit.insideGit &&
    requestedGit.insideGit &&
    sessionGitRoot &&
    requestedGitRoot &&
    sessionGitRoot === requestedGitRoot
  ) {
    return {
      disposition: "warn",
      detail:
        "Requested --project differs from session root, but both resolve to the same git repository. Reusing the session root for continuity safety.",
    };
  }

  if (
    isPathWithin(normalizedSessionRoot, normalizedRequestedRoot) ||
    isPathWithin(normalizedRequestedRoot, normalizedSessionRoot)
  ) {
    return {
      disposition: "warn",
      detail:
        "Requested --project and session root are parent/child paths. Reusing the session root to preserve continuity ownership.",
    };
  }

  return {
    disposition: "block",
    detail:
      "Requested --project points to a different root than the stored session root.",
    hint:
      "Retry with the session's original project root, or omit --session-id to start a new session for the current project.",
  };
}

function buildMissingSessionRecoveryHint(input: {
  requestedSessionId: string;
  requestedProjectRoot: string;
  sessionManager: SessionManager;
}): string {
  const requestedRoot = normalizeRootPath(input.requestedProjectRoot);
  const reentrySummaries = input.sessionManager.listReentrySummaries({
    limit: 8,
    preferredProjectRoot: input.requestedProjectRoot,
  });
  const recoverableSummaries = reentrySummaries.filter(
    (summary) => summary.recoverable,
  );
  const sameProjectRecoverable = recoverableSummaries.filter((summary) => {
    const projectRoot = summary.projectRoot?.trim();
    if (!projectRoot) {
      return false;
    }
    return normalizeRootPath(projectRoot) === requestedRoot;
  });
  const candidates =
    sameProjectRecoverable.length > 0
      ? sameProjectRecoverable.slice(0, 4)
      : recoverableSummaries.slice(0, 4);
  const candidateToken =
    candidates.length > 0
      ? candidates
          .map(
            (candidate) =>
              `${candidate.id}|${candidate.resumeDisposition}|${candidate.projectRoot}`,
          )
          .join(",")
      : "none";
  const boundaryToken =
    sameProjectRecoverable.length > 0
      ? "session-rebind-required:same-project-recoverable-candidates"
      : candidates.length > 0
        ? "session-rebind-required:cross-project-recoverable-candidates"
        : "session-restart-required:no-recoverable-session-candidates";
  const resumeSourceToken =
    sameProjectRecoverable.length > 0 || candidates.length > 0
      ? "session-resume-source:rebind-required"
      : "session-resume-source:restart-required";

  return [
    boundaryToken,
    resumeSourceToken,
    `session-rebind-reason:missing-session-id:${input.requestedSessionId}`,
    `session-rebind-candidates:${candidateToken}`,
    candidates.length > 0
      ? "next-step:rerun-with-existing-session-id-or-omit-session-id-for-fresh-session"
      : "next-step:omit-session-id-to-start-fresh-session",
  ].join(" ");
}

export type ShellBootstrapPhase =
  | "fast-path-parse"
  | "config-load"
  | "workspace-session-resolution"
  | "background-services-start"
  | "interactive-shell-ready";

export interface ShellBootstrapResult {
  readonly phases: ShellBootstrapPhase[];
  readonly context: ShellRuntimeContext;
}

export function bootstrapShellRuntime(input: {
  cwd: string;
  launchCwd?: string;
  runtimeConfig: RuntimeConfig;
  gitContext: WorkflowGitContext;
  sessionManager: SessionManager;
  renderer: StreamingRenderer;
  requestedSessionId?: string;
  allowSessionRootMigration?: boolean;
}): ShellBootstrapResult {
  const phases: ShellBootstrapPhase[] = ["fast-path-parse", "config-load"];
  const originalCwd = input.launchCwd ?? input.cwd;
  const requestedProjectRoot = input.gitContext.root ?? input.cwd;

  let resumeProvenance: SessionResumeProvenance | undefined;
  const session = (() => {
    if (!input.requestedSessionId) {
      const created = input.sessionManager.createNew(requestedProjectRoot);
      resumeProvenance = {
        source: "fresh-start",
        resolvedSessionId: created.id,
      };
      return created;
    }

    if (!input.sessionManager.sessionExists(input.requestedSessionId)) {
      const reentrySummaries = input.sessionManager.listReentrySummaries({
        limit: 8,
        preferredProjectRoot: requestedProjectRoot,
      });
      const recoverableSummaries = reentrySummaries.filter(
        (summary) => summary.recoverable,
      );
      const requestedRoot = normalizeRootPath(requestedProjectRoot);
      const sameProjectRecoverable = recoverableSummaries.filter((summary) => {
        const projectRoot = summary.projectRoot?.trim();
        if (!projectRoot) {
          return false;
        }
        return normalizeRootPath(projectRoot) === requestedRoot;
      });
      const candidates =
        sameProjectRecoverable.length > 0
          ? sameProjectRecoverable.slice(0, 4)
          : recoverableSummaries.slice(0, 4);
      input.sessionManager.recordMissingSessionRebindContext({
        requestedMissingSessionId: input.requestedSessionId,
        projectRoot: requestedProjectRoot,
        candidateSessionIds: candidates.map((candidate) => candidate.id),
      });
      throw new SessionBootstrapError(
        `Requested session ${input.requestedSessionId} not found (session-rebind-required).`,
        buildMissingSessionRecoveryHint({
          requestedSessionId: input.requestedSessionId,
          requestedProjectRoot,
          sessionManager: input.sessionManager,
        }),
      );
    }

    const sessionSummary = input.sessionManager.describeSessionReentry(
      input.requestedSessionId,
    );
    let storedSessionRoot = sessionSummary.projectRoot?.trim();
    if (storedSessionRoot) {
      const conflictDecision = evaluateProjectRootConflict(
        storedSessionRoot,
        requestedProjectRoot,
      );
      if (conflictDecision.disposition === "block") {
        if (input.allowSessionRootMigration) {
          const reboundSession = input.sessionManager.rebindSessionProjectRoot(
            input.requestedSessionId,
            requestedProjectRoot,
          );
          storedSessionRoot = reboundSession.projectRoot.trim();
          input.renderer.renderLine(
            `Session root migration applied for ${input.requestedSessionId}: ${sessionSummary.projectRoot} -> ${storedSessionRoot}`,
          );
        } else {
          throw new SessionBootstrapError(
            [
              `Requested session ${input.requestedSessionId} cannot attach to the current project root.`,
              `session-root=${storedSessionRoot}`,
              `requested-root=${requestedProjectRoot}`,
              `reason=${conflictDecision.detail}`,
            ].join(" "),
            `${conflictDecision.hint} If you explicitly want to move this session, rerun with --migrate-session-root.`,
          );
        }
      } else if (conflictDecision.disposition === "warn") {
        input.renderer.renderLine(
          `Session/project root mismatch resolved by reusing session root (${storedSessionRoot}). ${conflictDecision.detail}`,
        );
      }
    }

    const resumeResult = input.sessionManager.tryResume(
      input.requestedSessionId,
      storedSessionRoot || requestedProjectRoot,
      { mode: "continuity-only" },
    );
    if (resumeResult.ok) {
      const explicitRebindMatch =
        input.sessionManager.consumeMissingSessionRebindContext({
          requestedSessionId: input.requestedSessionId,
          projectRoot: storedSessionRoot || requestedProjectRoot,
        });
      resumeProvenance = explicitRebindMatch
        ? {
            source: "explicit-rebind",
            requestedSessionId: explicitRebindMatch.requestedMissingSessionId,
            resolvedSessionId: explicitRebindMatch.resolvedSessionId,
            rebindFromMissingSessionId:
              explicitRebindMatch.requestedMissingSessionId,
          }
        : {
            source: "normal-resume",
            requestedSessionId: input.requestedSessionId,
            resolvedSessionId: resumeResult.session.id,
          };
      input.renderer.renderLine(`Resumed session ${resumeResult.session.id}`);
      return resumeResult.session;
    }

    if (isFailedResume(resumeResult)) {
        throw new SessionBootstrapError(
          `Requested session ${input.requestedSessionId} could not be resumed: ${resumeResult.error}`,
          resumeResult.recoveryHint,
        );
      }
    throw new SessionBootstrapError(
      `Requested session ${input.requestedSessionId} could not be resumed.`,
      "Inspect session state and retry with a valid --session-id.",
    );
  })();
  const boundProjectRoot = session.projectRoot || requestedProjectRoot;
  const boundGitContext = getWorkflowGitContext(boundProjectRoot);

  phases.push(
    "workspace-session-resolution",
    "background-services-start",
    "interactive-shell-ready",
  );

  return {
    phases,
    context: createShellRuntimeContext({
      cwd: boundProjectRoot,
      originalCwd,
      projectRoot: boundProjectRoot,
      runtimeConfig: input.runtimeConfig,
      gitContext: boundGitContext,
      session,
      resumeProvenance,
    }),
  };
}
