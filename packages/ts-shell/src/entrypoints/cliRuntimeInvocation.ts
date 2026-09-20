import type { ProviderCredentialResolution } from "../core/shell/providerCredentials.js";
import { checkRealProviderReadiness } from "../core/shell/providerReadiness.js";
import type { QueryEvent } from "../core/query/runtime/events.js";
import type { EscalationPrompt, EscalationResponse } from "../sandbox/index.js";
import { createProviderReadinessCliTerminalEvent } from "./providerReadinessCliSurface.js";
import type { PermissionScope } from "../cli/approval/permissionScope.js";
import type { AskQuestion } from "../core/tools/ask.js";
import type { SessionMessage } from "../session/schema/sessionMessage.js";
import { defaultHookDispatcher, type HookDispatcher } from "../core/hooks/hookDispatcher.js";
import { setupBuiltinVerificationHooks } from "../core/hooks/builtin/index.js";
import { createCoreToolRegistry } from "../core/tools/registry.js";
import { filterVisibleToolNames } from "../core/tools/prefilter.js";
import type { RuntimeConfig } from "../config/runtimeConfig.js";
import type { ToolDefinition } from "../tools/types.js";
import { buildSystemPrompt } from "../turn/prompt.js";
import { runTurn, type CompactionSetup, type TurnRun } from "../turn/session.js";
import { createStepFunction, type StepFunction } from "../turn/step.js";
import { createSyntheticStep } from "../turn/synthetic.js";
import { toolSchemas } from "../turn/tools.js";

type ProviderMode = "synthetic" | "real";

export interface CliRuntimeInvocationInput {
  readonly sessionId: string;
  readonly prompt: string;
  readonly workspaceRoot: string;
  readonly signal: AbortSignal;
  readonly maxTurns: number;
  readonly escalationPromptHandler: (prompt: EscalationPrompt) => Promise<EscalationResponse>;
  readonly providerCredentialResolution: ProviderCredentialResolution;
  readonly agentMode: "plan" | "build";
  readonly permissionScope?: PermissionScope;
  readonly interactiveAsk?: (questions: AskQuestion[]) => Promise<Record<string, string>>;
  readonly historyMessages?: readonly SessionMessage[];
  readonly onTurnMessage?: (message: SessionMessage) => void;
  readonly compaction?: CompactionSetup;
  readonly providerModeEnv?: string;  /** Tool visibility: disabledTools / hiddenToolPrefixes are applied from here. */
  readonly runtimeConfig?: RuntimeConfig;
}

export interface CliRuntimeInvocationRequest extends Omit<CliRuntimeInvocationInput, "providerModeEnv"> {
  readonly providerMode: ProviderMode;
}

export interface CliRuntimeInvocationResult {
  readonly events: AsyncIterable<QueryEvent>;
  /** Input the user can hand the run while it works; absent once it is over. */
  readonly input?: Pick<TurnRun, "steer" | "followUp" | "pending" | "clearQueue">;
}

type ProviderReadinessChecker = (
  input: Parameters<typeof checkRealProviderReadiness>[0],
) => ReturnType<typeof checkRealProviderReadiness>;

export interface CliRuntimeInvocationDependencies {
  readonly checkProviderReadiness: ProviderReadinessChecker;
  readonly createReadinessTerminalEvent: typeof createProviderReadinessCliTerminalEvent;
  /** The model behind a real run; the default speaks to the configured provider. */
  readonly createStep?: (request: CliRuntimeInvocationRequest, tools: ReadonlyMap<string, ToolDefinition>) => StepFunction;
  readonly tools?: () => ReadonlyMap<string, ToolDefinition>;
  readonly hooks?: HookDispatcher;
}

const defaultDependencies: CliRuntimeInvocationDependencies = {
  checkProviderReadiness: checkRealProviderReadiness,
  createReadinessTerminalEvent: createProviderReadinessCliTerminalEvent,
};

/**
 * Commands a synthetic run may be asked to carry out, mapped from the phrase a
 * prompt uses to the shell command it means. Only consulted when
 * `PRIVATE_AGENTS_SYNTHETIC_TOOLS` is set, so an ordinary synthetic run keeps
 * answering in prose.
 */
const SYNTHETIC_TOOL_INTENTS = [
  { phrase: "node version", tool: "bash", command: "node --version" },
  { phrase: "node --version", tool: "bash", command: "node --version" },
] as const;

function syntheticToolIntent() {
  if (process.env.PRIVATE_AGENTS_SYNTHETIC_TOOLS !== "1") return undefined;
  return SYNTHETIC_TOOL_INTENTS.map((intent) => ({
    phrase: intent.phrase,
    name: intent.tool,
    args: () => ({ command: intent.command }),
  }));
}

export function buildCliRuntimeInvocation(input: CliRuntimeInvocationInput): CliRuntimeInvocationRequest {
  const providerMode: ProviderMode = input.providerModeEnv === "synthetic" ? "synthetic" : "real";
  const { providerModeEnv: _providerModeEnv, ...request } = input;
  return { ...request, providerMode };
}

/**
 * Run one prompt.
 *
 * A real provider is checked for readiness first, so a missing key stops the
 * run with one actionable line instead of a request that fails later. Both
 * modes then drive the same turn; only the model behind it differs.
 */
export function runCliRuntimeInvocation(
  input: CliRuntimeInvocationInput,
  dependencies: CliRuntimeInvocationDependencies = defaultDependencies,
): CliRuntimeInvocationResult {
  const request = buildCliRuntimeInvocation(input);
  if (request.providerMode === "real") {
    return deferUntilReady(request, dependencies);
  }
  return startTurn(request, dependencies);
}

function deferUntilReady(
  request: CliRuntimeInvocationRequest,
  dependencies: CliRuntimeInvocationDependencies,
): CliRuntimeInvocationResult {
  let started: CliRuntimeInvocationResult | undefined;
  const bufferedSteers: string[] = [];
  const bufferedFollowUps: string[] = [];
  const events = (async function* (): AsyncIterable<QueryEvent> {
    const readiness = await dependencies.checkProviderReadiness({
      provider: request.providerCredentialResolution.provider,
      apiKey: request.providerCredentialResolution.credential?.apiKey,
      accountAuth: request.providerCredentialResolution.credential?.accountAuth,
      baseUrl: request.providerCredentialResolution.baseUrl,
      model: request.providerCredentialResolution.model,
    });
    if (readiness.ok === false) {
      yield dependencies.createReadinessTerminalEvent({
        sessionId: request.sessionId,
        prompt: request.prompt,
        stopReason: readiness.failure.stopReason,
      });
      return;
    }
    started = startTurn(request, dependencies);
    for (const text of bufferedSteers) started.input?.steer(text);
    for (const text of bufferedFollowUps) started.input?.followUp(text);
    bufferedSteers.length = 0;
    bufferedFollowUps.length = 0;
    yield* started.events;
  })();
  return {
    events,
    input: {
      steer: (text) => {
        if (started?.input) started.input.steer(text);
        else bufferedSteers.push(text);
      },
      followUp: (text) => {
        if (started?.input) started.input.followUp(text);
        else bufferedFollowUps.push(text);
      },
      pending: () => started?.input?.pending() ?? { steering: [...bufferedSteers], followUps: [...bufferedFollowUps] },
      clearQueue: () => {
        const taken = [...bufferedSteers, ...bufferedFollowUps];
        bufferedSteers.length = 0;
        bufferedFollowUps.length = 0;
        return [...taken, ...(started?.input?.clearQueue() ?? [])];
      },
    },
  };
}

function startTurn(
  request: CliRuntimeInvocationRequest,
  dependencies: CliRuntimeInvocationDependencies,
): CliRuntimeInvocationResult {
  const hooks = dependencies.hooks ?? defaultHookDispatcher;
  setupBuiltinVerificationHooks(hooks);
  const registry = dependencies.tools?.() ?? createCoreToolRegistry();
  // Honour disabledTools / hiddenToolPrefixes from user config. Without this the
  // fields are accepted and then ignored, so a tool the user disabled still runs.
  const tools = request.runtimeConfig
    ? restrictToolPool(registry, request.runtimeConfig)
    : registry;
  const run = runTurn({
    sessionId: request.sessionId,
    prompt: request.prompt,
    workspaceRoot: request.workspaceRoot,
    agentMode: request.agentMode,
    permissionScope: request.permissionScope,
    escalationPromptHandler: request.escalationPromptHandler,
    interactiveAsk: request.interactiveAsk,
    history: request.historyMessages ?? [],
    onMessage: request.onTurnMessage ?? (() => {}),
    step: request.providerMode === "synthetic" ? createSyntheticStep({ toolIntent: syntheticToolIntent() }) : (dependencies.createStep ?? createProviderStep)(request, tools),
    tools,
    hooks,
    maxSteps: request.maxTurns,
    compaction: request.compaction,
    signal: request.signal,
  });
  return { events: run.events, input: run };
}

function createProviderStep(request: CliRuntimeInvocationRequest, tools: ReadonlyMap<string, ToolDefinition>): StepFunction {
  const resolution = request.providerCredentialResolution;
  return createStepFunction({
    provider: {
      apiKey: resolution.credential?.apiKey ?? "",
      baseUrl: resolution.baseUrl ?? resolution.credential?.baseUrl ?? "",
      model: resolution.model ?? resolution.credential?.model ?? "",
    },
    workspaceRoot: request.workspaceRoot,
    sessionId: request.sessionId,
    systemPrompt: buildSystemPrompt(request.agentMode),
    tools: toolSchemas(tools),
    // Sampling settings travel with the request, not with the provider: a
    // provider that ignores them still receives a well-formed request, and a
    // run that sets none keeps the step's own defaults.
    temperature: request.runtimeConfig?.temperature,
    topP: request.runtimeConfig?.topP,
    maxOutputTokens: request.runtimeConfig?.maxOutputTokens,
  });
}

function restrictToolPool(
  registry: ReadonlyMap<string, ToolDefinition>,
  runtimeConfig: RuntimeConfig,
): ReadonlyMap<string, ToolDefinition> {
  const visible = new Set(
    filterVisibleToolNames([...registry.keys()], runtimeConfig),
  );
  if (visible.size === registry.size) return registry;
  return new Map([...registry].filter(([name]) => visible.has(name)));
}
