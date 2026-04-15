import type { SchemaVersion } from "../../../../contracts/typescript/types.js";
import { getRuntimeConfig } from "../config/runtimeConfig.js";
import { CoreMcpGateway } from "../core/mcp/gateway.js";
import type { QueryEvent } from "../core/query/events.js";
import type { QueryRuntimeStateSeed } from "../core/query/runtimeState.js";
import { OpenAIModelAdapter } from "../model-adapters/providers/openai/OpenAIModelAdapter.js";
import { createComponentLogger, recordCount } from "../observability/index.js";
import {
  SandboxEnforcer,
  type EscalationDecision,
  type EscalationPrompt,
  type EscalationResponse,
} from "../sandbox/index.js";
import { ToolDispatcher } from "../tools/dispatcher.js";
import { getWorkflowGitContext } from "../workflow/gitContext.js";
import { MultiAgentOrchestrator } from "./MultiAgentOrchestrator.js";
import type {
  AgentExecutionInput,
  AgentExecutionOutput,
  OrchestrationResult,
} from "./types.js";

const CONTRACT_VERSION: SchemaVersion = "1.0.0";
const RUN_COMMAND_ALLOWLIST = [
  "node --version",
  "npm test -- --help",
  "npm run build -- --help",
] as const;

export interface MvpIntegratedFlowOptions {
  readonly sessionId: string;
  readonly prompt: string;
  readonly workspaceRoot: string;
  readonly maxTurns?: number;
  readonly escalationDecision?: EscalationDecision;
  readonly escalationPromptHandler?: (
    prompt: EscalationPrompt,
  ) => Promise<EscalationResponse>;
  readonly providerMode?: "synthetic" | "real";
  readonly runtimeSeed?: QueryRuntimeStateSeed;
}

export async function runMvpIntegratedFlow(
  options: MvpIntegratedFlowOptions,
): Promise<OrchestrationResult> {
  const logger = createComponentLogger("orchestration");
  const workflowContext = getWorkflowGitContext(options.workspaceRoot);
  const runtimeConfig = getRuntimeConfig(options.workspaceRoot);
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
      decision: options.escalationDecision,
      respondedAt: Date.now(),
      userComment: `Decision from runtime config: ${options.escalationDecision}`,
    }));
  }

  const dispatcher = new ToolDispatcher(enforcer, {
    mcpTools: mcpSnapshot.tools,
    mcpGateway,
    runtimeConfig,
  });
  const runner = createIntegratedRunner(
    options.workspaceRoot,
    dispatcher,
    workflowContext,
    mcpSnapshot,
    options.providerMode ?? "synthetic",
  );

  try {
    const orchestrator = new MultiAgentOrchestrator(runner);
    logger.info("Integrated flow started", { sessionId: options.sessionId });
    const result = await orchestrator.run(options.sessionId, options.prompt, {
      maxTurns: options.maxTurns ?? 6,
      runtimeSeed: options.runtimeSeed,
    });
    logger.info("Integrated flow finished", {
      sessionId: options.sessionId,
      status: result.status,
    });
    recordCount("orchestration.runs", 1, { status: result.status });
    return result;
  } finally {
    enforcer.close();
  }
}

export async function* streamMvpIntegratedFlow(
  options: MvpIntegratedFlowOptions,
): AsyncIterable<QueryEvent> {
  const workflowContext = getWorkflowGitContext(options.workspaceRoot);
  const runtimeConfig = getRuntimeConfig(options.workspaceRoot);
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
      decision: options.escalationDecision,
      respondedAt: Date.now(),
      userComment: `Synthetic ${options.escalationDecision} for integration flow`,
    }));
  }

  const dispatcher = new ToolDispatcher(enforcer, {
    mcpTools: mcpSnapshot.tools,
    mcpGateway,
    runtimeConfig,
  });
  const runner = createIntegratedRunner(
    options.workspaceRoot,
    dispatcher,
    workflowContext,
    mcpSnapshot,
    options.providerMode ?? "synthetic",
  );

  try {
    const orchestrator = new MultiAgentOrchestrator(runner);
    yield* orchestrator.stream(options.sessionId, options.prompt, {
      maxTurns: options.maxTurns ?? 6,
      runtimeSeed: options.runtimeSeed,
    });
  } finally {
    enforcer.close();
  }
}

function createIntegratedRunner(
  workspaceRoot: string,
  dispatcher: ToolDispatcher,
  workflowContext: ReturnType<typeof getWorkflowGitContext>,
  mcpSnapshot: Awaited<ReturnType<CoreMcpGateway["snapshot"]>>,
  providerMode: "synthetic" | "real",
): (input: AgentExecutionInput) => Promise<AgentExecutionOutput> {
  return async ({ role, sharedContext, turn }) => {
    if (role === "planner") {
      const content = await streamRoleDraft(
        role,
        `Plan accepted for prompt: ${sharedContext.initialPrompt}. Proceed to coding and respect sandbox policy.`,
        providerMode,
      );

      return {
        role,
        content,
        handoffTo: "coder",
        handoffReason: "Plan validated and ready",
        events: [
          {
            type: "mcp.snapshot",
            clients: mcpSnapshot.clients.length,
            tools: mcpSnapshot.tools.length,
          },
        ],
        notes: [
          `planner: turn=${turn}`,
          `workflow: branch=${workflowContext.branch ?? "unknown"} clean=${workflowContext.isClean === true ? "yes" : "no"}`,
          `mcp: clients=${mcpSnapshot.clients.length} tools=${mcpSnapshot.tools.length}`,
          `visible-tools: ${dispatcher.listVisibleTools().join(", ") || "none"}`,
          ...(workflowContext.branch === "main" &&
          workflowContext.isClean === false
            ? [
                "workflow: recommend using an isolated worktree before heavy implementation on a dirty main branch",
              ]
            : []),
        ],
      };
    }

    if (role === "coder") {
      const notes: string[] = [];
      const events: QueryEvent[] = [];
      const plan = buildMinimalTaskPlan(sharedContext.initialPrompt);
      notes.push(`plan: intent=${plan.intent} reason=${plan.reason}`);

      if (plan.intent === "inspect-files") {
        const globTaskId = `task_${sharedContext.sessionId}_${turn}_glob`;
        events.push({
          type: "tool.started",
          toolName: "glob",
          taskId: globTaskId,
        });
        const globResult = await dispatcher.dispatch(
          "glob",
          { pattern: plan.pattern },
          {
            taskId: globTaskId,
            workspaceRoot,
            sessionId: sharedContext.sessionId,
          },
        );
        events.push({
          type: "tool.result",
          toolName: "glob",
          taskId: globTaskId,
          success: globResult.success,
        });

        if (globResult.success) {
          notes.push(`tool: approved glob(${plan.pattern})`);
        } else {
          notes.push(
            `tool: denied glob(${plan.pattern}) -> ${globResult.error ?? "unknown"}`,
          );
        }
      } else {
        if (plan.blockedReason) {
          throw {
            message: plan.blockedReason,
            retryable: false,
            events,
          };
        }

        const bashTaskId = `task_${sharedContext.sessionId}_${turn}_bash`;
        events.push({
          type: "approval.requested",
          toolName: "bash",
          taskId: bashTaskId,
        });
        events.push({
          type: "tool.started",
          toolName: "bash",
          taskId: bashTaskId,
        });
        const bashResult = await dispatcher.dispatch(
          "bash",
          { command: plan.command },
          {
            taskId: bashTaskId,
            workspaceRoot,
            sessionId: sharedContext.sessionId,
          },
        );
        events.push({
          type: "approval.resolved",
          toolName: "bash",
          taskId: bashTaskId,
          outcome: bashResult.success ? "approved" : "denied",
        });
        events.push({
          type: "tool.result",
          toolName: "bash",
          taskId: bashTaskId,
          success: bashResult.success,
        });

        if (bashResult.success) {
          notes.push(`tool: approved bash(${plan.command}) via escalation`);
        } else {
          notes.push(
            `tool: denied bash(${plan.command}) -> ${bashResult.error ?? "unknown"}`,
          );

          throw {
            message: `Approval denied by user for bash: ${bashResult.error ?? "unknown"}`,
            retryable: false,
            events,
          };
        }
      }

      const content = await streamRoleDraft(
        role,
        `Implementation pass complete with ${notes.length} tool decision(s).`,
        providerMode,
      );

      return {
        role,
        content,
        handoffTo: "reviewer",
        handoffReason: "Coding pass and tool dispatch complete",
        events,
        notes,
      };
    }

    const content = await streamRoleDraft(
      role,
      "Review complete. Delivering streamed result and preserving safety guardrails.",
      providerMode,
    );
    return {
      role,
      content,
      notes: [`reviewer: handoffs=${sharedContext.handoffs.length}`],
    };
  };
}

type MinimalTaskPlan =
  | {
      readonly intent: "inspect-files";
      readonly pattern: string;
      readonly reason: string;
    }
  | {
      readonly intent: "run-command";
      readonly command: string;
      readonly reason: string;
      readonly blockedReason?: string;
    };

function buildMinimalTaskPlan(prompt: string): MinimalTaskPlan {
  const normalized = prompt.toLowerCase();
  if (/(list|find|search|scan|file|files|目录|文件|查找|列出)/i.test(prompt)) {
    return {
      intent: "inspect-files",
      pattern: detectFilePattern(normalized),
      reason: "file-oriented prompt",
    };
  }

  const unsupportedCommand = detectUnsupportedCommandIntent(normalized);
  if (unsupportedCommand) {
    return {
      intent: "run-command",
      command: unsupportedCommand,
      reason: "command intent outside MVP allowlist",
      blockedReason: blockedCommandReason(unsupportedCommand),
    };
  }

  const command = detectCommand(normalized);
  return {
    intent: "run-command",
    command,
    reason: "command-oriented fallback",
    ...(isAllowlistedRunCommand(command)
      ? {}
      : { blockedReason: blockedCommandReason(command) }),
  };
}

function detectFilePattern(normalizedPrompt: string): string {
  if (
    normalizedPrompt.includes(".md") ||
    normalizedPrompt.includes("markdown")
  ) {
    return ".md";
  }

  if (normalizedPrompt.includes(".json") || normalizedPrompt.includes("json")) {
    return ".json";
  }

  if (
    normalizedPrompt.includes(".ts") ||
    normalizedPrompt.includes("typescript") ||
    normalizedPrompt.includes("ts")
  ) {
    return ".ts";
  }

  return ".ts";
}

function detectCommand(normalizedPrompt: string): string {
  // Keep command mapping intentionally narrow for MVP controllability.
  if (
    normalizedPrompt.includes("version") ||
    normalizedPrompt.includes("版本")
  ) {
    return "node --version";
  }

  if (normalizedPrompt.includes("test") || normalizedPrompt.includes("测试")) {
    return "npm test -- --help";
  }

  if (normalizedPrompt.includes("build") || normalizedPrompt.includes("构建")) {
    return "npm run build -- --help";
  }

  return "node --version";
}

function detectUnsupportedCommandIntent(
  normalizedPrompt: string,
): string | null {
  if (
    normalizedPrompt.includes("publish") ||
    normalizedPrompt.includes("发布")
  ) {
    return "npm publish";
  }

  if (
    normalizedPrompt.includes("deploy") ||
    normalizedPrompt.includes("部署")
  ) {
    return "npm run deploy";
  }

  if (
    normalizedPrompt.includes("delete") ||
    normalizedPrompt.includes("删除") ||
    normalizedPrompt.includes("rm ")
  ) {
    return "rm -rf";
  }

  if (normalizedPrompt.includes("curl") || normalizedPrompt.includes("wget")) {
    return "curl";
  }

  return null;
}

function isAllowlistedRunCommand(command: string): boolean {
  return RUN_COMMAND_ALLOWLIST.includes(
    command as (typeof RUN_COMMAND_ALLOWLIST)[number],
  );
}

function blockedCommandReason(command: string): string {
  return [
    `Run-command intent is not allowed in the MVP allowlist: ${command}`,
    `Allowed commands: ${RUN_COMMAND_ALLOWLIST.join(", ")}`,
    "Please rephrase your request to one of the allowed command intents.",
  ].join(" ");
}

async function streamRoleDraft(
  role: "planner" | "coder" | "reviewer",
  draft: string,
  providerMode: "synthetic" | "real",
): Promise<string> {
  const adapter =
    providerMode === "real"
      ? createRealProviderAdapter()
      : new OpenAIModelAdapter(
          { provider: "openai", apiKey: "local-mvp-test-key" },
          async () =>
            new Response(
              createSyntheticSseBody(`${role.toUpperCase()}: ${draft}`),
              {
                status: 200,
                headers: { "content-type": "text/event-stream" },
              },
            ),
        );

  let text = "";
  for await (const event of adapter.streamResponse({
    schemaVersion: CONTRACT_VERSION,
    model: "gpt-4.1-mini",
    messages: [{ role: "user", content: draft }],
  })) {
    if (event.type === "content.delta") {
      text += event.delta;
    }
  }

  return text.trim();
}

function createRealProviderAdapter(): OpenAIModelAdapter {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is required for the real provider path. Set it before running the CLI.",
    );
  }

  return new OpenAIModelAdapter({ provider: "openai", apiKey });
}

function createSyntheticSseBody(content: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const first = content.slice(0, Math.ceil(content.length / 2));
  const second = content.slice(Math.ceil(content.length / 2));

  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({
            model: "gpt-4.1-mini",
            choices: [{ delta: { content: first } }],
          })}\n\n`,
        ),
      );
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({
            model: "gpt-4.1-mini",
            choices: [{ delta: { content: second }, finish_reason: "stop" }],
            usage: { prompt_tokens: 5, completion_tokens: 8, total_tokens: 13 },
          })}\n\n`,
        ),
      );
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
}
