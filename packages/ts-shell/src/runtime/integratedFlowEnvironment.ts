import { getRuntimeConfig } from "../config/runtimeConfig.js";
import { CoreMcpGateway } from "../core/mcp/gateway.js";
import { getPwRuntimeStatus, type PwRuntimeStatus } from "../core/context/pwRuntime.js";
import type {
  EscalationDecision,
  EscalationPrompt,
  EscalationResponse,
} from "../sandbox/index.js";
import { SandboxEnforcer } from "../sandbox/index.js";
import { ToolDispatcher } from "../tools/dispatcher.js";
import { getWorkflowGitContext } from "../workflow/gitContext.js";

export interface IntegratedFlowEnvironmentOptions {
  readonly workspaceRoot: string;
  readonly sessionId: string;
  readonly escalationDecision?: EscalationDecision;
  readonly escalationPromptHandler?: (
    prompt: EscalationPrompt,
  ) => Promise<EscalationResponse>;
  readonly browserRuntimeStatus?: PwRuntimeStatus;
  readonly escalationDecisionUserComment: (
    decision: EscalationDecision,
  ) => string;
}

export interface IntegratedFlowEnvironment {
  readonly workflowContext: ReturnType<typeof getWorkflowGitContext>;
  readonly mcpSnapshot: Awaited<ReturnType<CoreMcpGateway["snapshot"]>>;
  readonly browserRuntimeStatus: PwRuntimeStatus;
  readonly enforcer: SandboxEnforcer;
  readonly dispatcher: ToolDispatcher;
  close(): void;
}

export async function buildIntegratedFlowEnvironment(
  options: IntegratedFlowEnvironmentOptions,
): Promise<IntegratedFlowEnvironment> {
  const workflowContext = getWorkflowGitContext(options.workspaceRoot);
  const runtimeConfig = getRuntimeConfig(options.workspaceRoot);
  const browserRuntimeStatus =
    options.browserRuntimeStatus ?? await getPwRuntimeStatus();
  const mcpGateway = new CoreMcpGateway(options.workspaceRoot);
  const mcpSnapshot = await mcpGateway.snapshot();
  const enforcer = new SandboxEnforcer({
    workspaceRoot: options.workspaceRoot,
    sessionId: options.sessionId,
  });

  if (options.escalationPromptHandler) {
    enforcer.setEscalationPromptHandler(options.escalationPromptHandler);
  } else if (options.escalationDecision) {
    enforcer.setEscalationPromptHandler(async (prompt) => ({
      promptId: prompt.id,
      decision: options.escalationDecision!,
      respondedAt: Date.now(),
      userComment: options.escalationDecisionUserComment(
        options.escalationDecision!,
      ),
    }));
  }

  const dispatcher = new ToolDispatcher(enforcer, {
    mcpTools: mcpSnapshot.tools,
    mcpGateway,
    runtimeConfig,
    browserRuntimeStatus,
  });

  return {
    workflowContext,
    mcpSnapshot,
    browserRuntimeStatus,
    enforcer,
    dispatcher,
    close: () => enforcer.close(),
  };
}
