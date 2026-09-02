import { getRuntimeConfig } from "../../config/runtimeConfig.js";
import type {
  ShellBootstrapResult,
} from "../../core/shell/bootstrap.js";
import {
  bootstrapShellRuntime,
} from "../../core/shell/bootstrap.js";
import type { ShellRuntimeContext } from "../../core/shell/runtimeContext.js";
import { StreamingRenderer } from "../../renderer/StreamingRenderer.js";
import type { StructuredLogger } from "../../observability/index.js";
import { SessionManager } from "../../session/SessionManager.js";
import { getWorkflowGitContext } from "../../workflow/gitContext.js";
import type { CliOptions } from "../options/cliOptions.js";
import {
  createCliMcpGateway,
  type CliMcpGateway,
} from "../../entrypoints/cliMcpModule.js";
import {
  resolveTargetProjectRoot,
} from "../../entrypoints/cliWorkspaceModule.js";
import {
  handleCliBootstrapError,
} from "../errors/cliBootstrapErrorBoundary.js";

export interface CliRootContext {
  readonly runtimeBaseDir: string;
  readonly gitContext: ReturnType<typeof getWorkflowGitContext>;
  readonly workspaceRoot: string;
  readonly runtimeConfig: ReturnType<typeof getRuntimeConfig>;
}

export interface CliBootstrapRuntimeContext extends CliRootContext {
  readonly sessionManager: SessionManager;
  readonly renderer: StreamingRenderer;
  readonly recoveryCandidate: ReturnType<
    SessionManager["getSuggestedRecoverySession"]
  >;
  readonly recoveryCandidateSummary: ReturnType<
    SessionManager["describeSessionReentry"]
  > | null;
  readonly recoveryBlockedNotice: ReturnType<
    SessionManager["getRecoveryTrustBoundaryBlock"]
  >;
  readonly bootstrap: ShellBootstrapResult;
  readonly runtimeContext: ShellRuntimeContext;
  readonly mcpGateway: CliMcpGateway;
}

export interface CreateCliRootContextInput {
  readonly launchCwd: string;
  readonly options: CliOptions;
}

export function createCliRootContext(
  input: CreateCliRootContextInput,
): CliRootContext {
  const runtimeBaseDir = resolveTargetProjectRoot(
    input.launchCwd,
    input.options.projectPath,
  );
  const gitContext = getWorkflowGitContext(runtimeBaseDir);
  const workspaceRoot = gitContext.root ?? runtimeBaseDir;
  const runtimeConfig = getRuntimeConfig(workspaceRoot);
  return {
    runtimeBaseDir,
    gitContext,
    workspaceRoot,
    runtimeConfig,
  };
}

export interface CreateCliBootstrapRuntimeContextInput {
  readonly launchCwd: string;
  readonly options: CliOptions;
  readonly rootContext: CliRootContext;
  readonly writeError: (message: string) => void;
  readonly exit: (code: number) => never;
}

export function createCliBootstrapRuntimeContext(
  input: CreateCliBootstrapRuntimeContextInput,
): CliBootstrapRuntimeContext {
  const sessionManager = new SessionManager();
  const renderer = new StreamingRenderer();
  // What a bare `/resume` or `/continue` falls back to. Recovery eligibility is too
  // narrow for that: a session that finished cleanly is exactly what someone means
  // by "the one I was in".
  const recoveryCandidate = !input.options.sessionId
    ? sessionManager.getReentryCandidate({
        preferredProjectRoot: input.rootContext.workspaceRoot,
      })
    : null;
  const recoveryCandidateSummary = recoveryCandidate
    ? sessionManager.describeSessionReentry(recoveryCandidate.id)
    : null;
  const recoveryBlockedNotice =
    !input.options.sessionId && !recoveryCandidate
      ? sessionManager.getRecoveryTrustBoundaryBlock({
          preferredProjectRoot: input.rootContext.workspaceRoot,
        })
      : null;
  const bootstrap = (() => {
    try {
      return bootstrapShellRuntime({
        cwd: input.rootContext.workspaceRoot,
        launchCwd: input.launchCwd,
        runtimeConfig: input.rootContext.runtimeConfig,
        gitContext: input.rootContext.gitContext,
        requestedWorkspaceRoot: input.rootContext.runtimeBaseDir,
        sessionManager,
        renderer,
        requestedSessionId: input.options.sessionId,
        allowSessionRootMigration: input.options.migrateSessionRoot === true,
        emitLifecycleMessages: false,
        // A one-shot run continues where the user left off; an interactive launch
        // is a new sitting and starts its own session.
        adoptCurrentSession: input.options.printMode === true,
      });
    } catch (error) {
      handleCliBootstrapError({
        error,
        renderer,
        writeError: input.writeError,
        exit: input.exit,
      });
    }
  })();
  const runtimeContext = bootstrap.context;
  const mcpGateway = createCliMcpGateway(runtimeContext.cwd);

  return {
    ...input.rootContext,
    sessionManager,
    renderer,
    recoveryCandidate,
    recoveryCandidateSummary,
    recoveryBlockedNotice,
    bootstrap,
    runtimeContext,
    mcpGateway,
  };
}

export interface LogCliBootstrapSessionInitializedInput {
  readonly logger: StructuredLogger;
  readonly bootstrapRuntime: CliBootstrapRuntimeContext;
}

export function logCliBootstrapSessionInitialized(
  input: LogCliBootstrapSessionInitializedInput,
): void {
  input.logger.info("CLI session initialized", {
    sessionId: input.bootstrapRuntime.runtimeContext.session.id,
    phases: input.bootstrapRuntime.bootstrap.phases.join(" -> "),
  });
}
