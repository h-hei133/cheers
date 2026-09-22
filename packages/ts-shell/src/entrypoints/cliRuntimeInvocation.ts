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
import { registerDeclaredHooks, type HookApprovalRequest } from "../core/hooks/registration.js";
import { createCoreToolRegistry } from "../core/tools/registry.js";
import { filterVisibleToolNames } from "../core/tools/prefilter.js";
import type { RuntimeConfig } from "../config/runtimeConfig.js";
import type { ToolDefinition } from "../tools/types.js";
import { buildSystemPrompt, type SystemPromptContext } from "../turn/prompt.js";
import { renderSkillList, SkillLoader, type Skill } from "../core/skills/skillLoader.js";
import {
  DEFAULT_INSTRUCTION_BUDGET_BYTES,
  loadInstructionFiles,
  renderInstructionFiles,
} from "../context/instructions/projectInstructions.js";
import { createComponentLogger } from "../observability/structuredLogger.js";
import { neutraliseForDisplay } from "../core/text/safety.js";
import { projectTrust } from "../core/security/projectTrust.js";
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
 * `CHEERS_SYNTHETIC_TOOLS` is set, so an ordinary synthetic run keeps
 * answering in prose.
 */
const SYNTHETIC_TOOL_INTENTS = [
  { phrase: "node version", tool: "bash", command: "node --version" },
  { phrase: "node --version", tool: "bash", command: "node --version" },
] as const;

function syntheticToolIntent() {
  if (process.env.CHEERS_SYNTHETIC_TOOLS !== "1") return undefined;
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

/**
 * The skills this run may offer the model.
 *
 * Discovered once per run rather than per turn: discovery reads the filesystem,
 * and the system prompt is built once, so a per-turn scan would repeat work whose
 * result is not consulted again.
 *
 * A project explicitly marked untrusted contributes no project skills. Its skills
 * are text that would enter the system prompt, and a project nobody has vouched
 * for does not get to write there. User-level skills are the user's own and load
 * regardless.
 */
function discoverSkills(request: CliRuntimeInvocationRequest): ReadonlyMap<string, Skill> {
  const loader = new SkillLoader(request.workspaceRoot);
  const { skills: found, collisions, diagnostics } = loader.loadDetailed();

  // Reported because a malformed skill is otherwise invisible: a missing
  // description keeps it out of the model's list entirely, and a bad name is
  // something the author can only discover by noticing it never appears.
  for (const diagnostic of diagnostics) {
    createComponentLogger("skills").warn(`${diagnostic.filePath} ${diagnostic.message}.`);
  }

  if (collisions.length > 0) {
    // Surfaced because the losing file is otherwise invisible: the winner
    // appears and the other never does, so nobody learns editing it has no effect.
    for (const collision of collisions) {
      createComponentLogger("skills").warn(
        `Skill name '${collision.name}' is claimed by ${collision.winnerPath} and ${collision.loserPath}; using ${collision.winnerPath}.`,
      );
    }
  }

  if (!projectTrust.isProjectUntrusted(request.workspaceRoot)) return found;

  return new Map([...found].filter(([, skill]) => skill.source === "user"));
}

/**
 * The project context that reaches the system prompt.
 *
 * Both parts are read here, once, at the point where the run's workspace and
 * configuration are already known. They are assembled into one value so the step
 * factory takes a single argument rather than reaching back into the filesystem
 * for material the caller has already gathered.
 *
 * Project instructions are withheld from an explicitly untrusted project for the
 * same reason as its skills: they are repository-controlled text going into the
 * system prompt.
 */
function buildPromptContext(
  request: CliRuntimeInvocationRequest,
  skills: ReadonlyMap<string, Skill>,
  toolNames: readonly string[],
): SystemPromptContext {
  const untrusted = projectTrust.isProjectUntrusted(request.workspaceRoot);
  const instructions = untrusted
    ? { files: [], truncated: false }
    : loadInstructionFiles({
        cwd: request.workspaceRoot,
        // Absent means the loader's own default; zero is the opt-out.
        maxBytes: request.runtimeConfig?.instructionBudgetBytes,
      });

  // Said out loud rather than swallowed: a project whose rules were cut short is
  // one where the model is following a truncated version of them, and that is
  // worth knowing before wondering why a rule was ignored.
  if (instructions.truncated) {
    createComponentLogger("project-instructions").warn(
      `Instruction files exceeded the ${request.runtimeConfig?.instructionBudgetBytes ?? DEFAULT_INSTRUCTION_BUDGET_BYTES}-byte budget and were truncated.`,
    );
  }

  return {
    instructions: renderInstructionFiles(instructions.files),
    skills: renderSkillList(skills),
    toolNames,
  };
}

/**
 * Ask the user whether one declared command may run.
 *
 * The command text is written by whoever wrote the repository, and it is shown at
 * the exact moment a person is deciding whether to trust them. Rendered verbatim
 * it could contain newlines that forge extra prompt lines, or control sequences
 * that repaint what is on screen, so it is neutralised first: the user has to be
 * able to trust what they are reading as much as what they are approving.
 *
 * A run with no way to ask refuses, which is what keeps a repository's commands
 * from executing unattended simply because nobody was present to object.
 */
async function approveDeclaredHook(
  request: CliRuntimeInvocationRequest,
  hook: { readonly command: string; readonly event: string; readonly matcher?: string; readonly sourcePath: string },
): Promise<boolean> {
  if (!request.escalationPromptHandler) return false;

  const response = await request.escalationPromptHandler({
    id: `hook-approval-${Date.now()}`,
    title: "Run a command this project asks for?",
    message: [
      `${neutraliseForDisplay(hook.sourcePath)} declares a command to run on the ${neutraliseForDisplay(hook.event)} event.`,
      hook.matcher ? `Applies to: ${neutraliseForDisplay(hook.matcher)}` : "Applies to all tools.",
      "",
      "Command:",
      `  ${neutraliseForDisplay(hook.command)}`,
      "",
      "Approval is remembered for this exact command; changing it asks again.",
    ].join("\n"),
    context: {
      toolName: "hook",
      operation: hook.event,
      target: hook.command,
    },
    options: [
      { value: "allow-once", label: "Allow once", description: "Run it for this session." },
      { value: "allow-always", label: "Allow and remember", description: "Run it until the command changes." },
      { value: "deny", label: "Deny", description: "Do not run it." },
    ],
    defaultOption: "deny",
    recommendedAction: "Review the command before allowing it.",
    severity: "high",
  });

  return response.decision === "allow" || response.decision === "allow-once" || response.decision === "allow-always";
}

function startTurn(
  request: CliRuntimeInvocationRequest,
  dependencies: CliRuntimeInvocationDependencies,
): CliRuntimeInvocationResult {
  const hooks = dependencies.hooks ?? defaultHookDispatcher;
  setupBuiltinVerificationHooks(hooks);
  // Declared hooks are registered here so the user can be asked about them; the
  // approval itself is awaited at dispatch, where a pending answer does not hold
  // up the start of the run.
  registerDeclaredHooks(hooks, request.workspaceRoot, {
    requestApproval: (hook) => approveDeclaredHook(request, hook),
    bypassed: request.runtimeConfig?.allowUntrustedHooks === true,
  });
  const skills = discoverSkills(request);
  const registry = dependencies.tools?.() ?? createCoreToolRegistry({ skills });
  // Honour disabledTools / hiddenToolPrefixes from user config. Without this the
  // fields are accepted then ignored, so a tool the user disabled still runs.
  const tools = request.runtimeConfig
    ? restrictToolPool(registry, request.runtimeConfig)
    : registry;
  const promptContext = buildPromptContext(request, skills, [...tools.keys()]);
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
    step: request.providerMode === "synthetic" ? createSyntheticStep({ toolIntent: syntheticToolIntent() }) : (dependencies.createStep ?? createProviderStep)(request, tools, promptContext),
    tools,
    hooks,
    maxSteps: request.maxTurns,
    compaction: request.compaction,
    signal: request.signal,
  });
  return { events: run.events, input: run };
}

function createProviderStep(
  request: CliRuntimeInvocationRequest,
  tools: ReadonlyMap<string, ToolDefinition>,
  promptContext: SystemPromptContext,
): StepFunction {
  const resolution = request.providerCredentialResolution;
  return createStepFunction({
    provider: {
      apiKey: resolution.credential?.apiKey ?? "",
      baseUrl: resolution.baseUrl ?? resolution.credential?.baseUrl ?? "",
      model: resolution.model ?? resolution.credential?.model ?? "",
    },
    workspaceRoot: request.workspaceRoot,
    sessionId: request.sessionId,
    systemPrompt: buildSystemPrompt(request.agentMode, promptContext),
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
