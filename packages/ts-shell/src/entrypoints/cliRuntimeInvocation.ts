import type { PromptAttachments } from "../core/shell/sessionRuntime.js";
import * as fs from "node:fs";
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
import { loadCatalog } from "../core/models/catalogStore.js";
import { providerEndpoint } from "../core/models/catalog.js";
import type { AccountAuthConfig, RuntimeConfig } from "../config/runtimeConfig.js";
import type { ToolDefinition } from "../tools/types.js";
import { buildSystemPrompt, type SystemPromptContext } from "../turn/prompt.js";
import type { RequestOverhead } from "../session/context.js";
import { renderSkillList, type Skill } from "../core/skills/skillLoader.js";
import { resolveSkillCatalog } from "../core/skills/skillCatalog.js";
import {
  DEFAULT_INSTRUCTION_BUDGET_BYTES,
  loadAppendedInstructionFiles,
  renderAppendedInstructions,
  loadInstructionFiles,
  renderInstructionFiles,
} from "../context/instructions/projectInstructions.js";
import { createComponentLogger } from "../observability/structuredLogger.js";
import { neutraliseForDisplay } from "../core/text/safety.js";
import { projectTrust } from "../core/security/projectTrust.js";
import { CoreMcpGateway } from "../core/mcp/gateway.js";
import type { McpToolDescriptor } from "../core/mcp/types.js";
import { runTurn, type CompactionSetup, type TurnRun } from "../turn/session.js";
import { createStepFunction, type StepFunction } from "../turn/step.js";
import {
  providerFetchForEndpoint,
  providerFetchFromTimeouts,
  providerTimeoutsFrom,
} from "../provider/request/fetch.js";
import { endpointShape } from "../provider/endpoints/index.js";
import { accountAuthFor, providerAuthorization, renewAccountAuthIfExpiring } from "../provider/request/authorization.js";
import { persistRenewedAccountAuth } from "../core/auth/providerAuthRuntime.js";
import type {
  GoogleAccountAuthConfig,
  OpenAIAccountAuthConfig,
} from "../config/runtimeConfig.js";
import type { RuntimeProvider } from "../config/runtimeConfig.js";
import { createSyntheticStep } from "../turn/synthetic.js";
import { commandEnvironment } from "../runtime/execution/commandEnvironment.js";
import { createSessionStoreLayout, locateExistingSessionLayout } from "../session/store/sessionFileLayout.js";
import { getThinkingEffort } from "../core/commands/thinkingCommandRuntime.js";
import { toolSchemas } from "../turn/tools.js";
import { runSubagent, type SubagentRunner } from "../core/subagents/runner.js";
import { adaptTools } from "../turn/tools.js";

type ProviderMode = "synthetic" | "real";

export interface CliRuntimeInvocationInput {
  readonly sessionId: string;
  readonly prompt: string;
  /** Images that travelled with the prompt; see `PromptAttachments`. */
  readonly attachments?: PromptAttachments;
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
  /** Skill loading the run was started with: named paths, and discovery off. */
  readonly skillOptions?: {
    readonly skillPaths?: readonly string[];
    readonly noSkills?: boolean;
  };
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
export async function runCliRuntimeInvocation(
  input: CliRuntimeInvocationInput,
  dependencies: CliRuntimeInvocationDependencies = defaultDependencies,
): Promise<CliRuntimeInvocationResult> {
  const request = buildCliRuntimeInvocation(input);
  if (request.providerMode === "real") {
    return deferUntilReady(request, dependencies);
  }
  return startTurn(request, dependencies);
}

/**
 * Renew an expired account token and store the replacement.
 *
 * Lives on the invocation path rather than in the step because it must happen
 * before the credential is turned into headers, and because writing the new token
 * back is a filesystem operation that has no place inside a request builder.
 *
 * A failure is reported, not swallowed: a token the provider has already refused
 * cannot produce an answer, and the request that carries it fails for a reason the
 * user reads as a network problem. Naming the login as the cause is the only
 * version of this they can act on.
 */
async function renewAccountAuth(input: {
  readonly provider: RuntimeProvider;
  readonly credential: {
    readonly apiKey?: string;
    readonly accountAuth?: AccountAuthConfig;
  };
  readonly runtimeConfig: RuntimeConfig | undefined;
}): Promise<{
  readonly accountAuth?: AccountAuthConfig;
  readonly failure?: string;
}> {
  // The renewal carries the same deadline as any other request to the provider's
  // auth host, so a host that accepts the connection and never answers cannot hold
  // up the start of a turn.
  const fetchImpl = providerFetch(input.runtimeConfig);
  const result = await renewAccountAuthIfExpiring({
    provider: input.provider,
    credential: input.credential,
    fetchImpl,
  });
  if (result.renewed && result.accountAuth) {
    persistRenewedAccountAuth({ provider: input.provider, accountAuth: result.accountAuth });
  }
  return {
    accountAuth: result.accountAuth,
    ...(result.failure ? { failure: result.failure } : {}),
  };
}

function deferUntilReady(
  request: CliRuntimeInvocationRequest,
  dependencies: CliRuntimeInvocationDependencies,
): CliRuntimeInvocationResult {
  let started: CliRuntimeInvocationResult | undefined;
  const bufferedSteers: string[] = [];
  const bufferedFollowUps: string[] = [];
  const events = (async function* (): AsyncIterable<QueryEvent> {
    // Renewed before the readiness check, because the check is what tells the user
    // the credential is usable: one that passes on a token about to expire produces
    // a run that fails a minute later with no hint that the login is the reason.
    const renewed = await renewAccountAuth({
      provider: request.providerCredentialResolution.provider,
      credential: request.providerCredentialResolution.credential ?? {},
      runtimeConfig: request.runtimeConfig,
    });
    if (renewed.failure) {
      // The same terminal shape a failed readiness check produces, because it is
      // the same class of problem: the credential cannot be used, and the run
      // cannot start.
      yield dependencies.createReadinessTerminalEvent({
        sessionId: request.sessionId,
        prompt: request.prompt,
        stopReason: `Provider readiness failed (provider-readiness:auth): ${renewed.failure}`,
      });
      return;
    }
    const readiness = await dependencies.checkProviderReadiness({
      provider: request.providerCredentialResolution.provider,
      apiKey: request.providerCredentialResolution.credential?.apiKey,
      accountAuth: renewed.accountAuth ?? request.providerCredentialResolution.credential?.accountAuth,
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
    started = await startTurn(request, dependencies);
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
 * result is not consulted again. The trust gate and the CLI flags are applied by
 * the catalog, which is the same rule `/skill` and `/skill:` resolve through —
 * see `resolveSkillCatalog`.
 */
function discoverSkills(request: CliRuntimeInvocationRequest): ReadonlyMap<string, Skill> {
  const { skills, collisions, diagnostics, failures } = resolveSkillCatalog({
    workspaceRoot: request.workspaceRoot,
    ...(request.skillOptions?.skillPaths ? { skillPaths: request.skillOptions.skillPaths } : {}),
    ...(request.skillOptions?.noSkills ? { noSkills: true } : {}),
  });

  // Reported because a malformed skill is otherwise invisible: a missing
  // description keeps it out of the model's list entirely, and a bad name is
  // something the author can only discover by noticing it never appears.
  for (const diagnostic of diagnostics) {
    createComponentLogger("skills").warn(`${diagnostic.filePath} ${diagnostic.message}.`);
  }

  // A `--skill` path that loaded nothing is named for the same reason. The user
  // asked for that file by name, and silence would leave a typo looking exactly
  // like a skill the model chose not to use.
  for (const failure of failures) {
    createComponentLogger("skills").warn(`${failure.filePath} ${failure.message}.`);
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

  return skills;
}

/**
 * The MCP tools this run may offer, with the gateway that serves them.
 *
 * Nothing when the user has not enabled MCP tools: the servers are not
 * connected, and connecting them costs a process spawn per stdio server that a
 * run which never calls one should not pay.
 *
 * A snapshot that fails also yields nothing — the failure is reported to the
 * user by the command surface (`/mcp status` names the server and the reason),
 * and the run proceeds without tools the model cannot use. Registering a
 * server's tools from its config entry instead of its answer would advertise
 * tools that may not exist.
 */
async function mcpToolsForRun(
  request: CliRuntimeInvocationRequest,
): Promise<{ tools: readonly McpToolDescriptor[]; gateway: CoreMcpGateway } | undefined> {
  if (request.runtimeConfig?.enableMcpTools !== true) return undefined;
  const gateway = new CoreMcpGateway(request.workspaceRoot);
  try {
    const snapshot = await gateway.snapshot();
    if (snapshot.tools.length === 0) return undefined;
    return { tools: snapshot.tools, gateway };
  } catch {
    return undefined;
  }
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

  // Appended instructions are withheld from an untrusted project for the same
  // reason as the rule files: they are repository-controlled text entering the
  // system prompt.
  const appended = untrusted
    ? { files: [], truncated: false }
    : loadAppendedInstructionFiles({
        cwd: request.workspaceRoot,
        maxBytes: request.runtimeConfig?.instructionBudgetBytes,
      });
  if (appended.truncated) {
    createComponentLogger("project-instructions").warn(
      `Appended instruction files exceeded the ${request.runtimeConfig?.instructionBudgetBytes ?? DEFAULT_INSTRUCTION_BUDGET_BYTES}-byte budget and were truncated.`,
    );
  }

  return {
    instructions: renderInstructionFiles(instructions.files),
    appendedInstructions: renderAppendedInstructions(appended.files),
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

/**
 * The compaction setup with the request's fixed overhead attached.
 *
 * A no-op when there is no compaction to configure. The overhead is attached to
 * the policy rather than passed separately so every reader of that policy — the
 * automatic threshold and the `/compact` command — sees the same number, which
 * is the reason the two share a policy in the first place.
 */
function withRequestOverhead(
  compaction: CompactionSetup | undefined,
  overhead: RequestOverhead,
): CompactionSetup | undefined {
  if (!compaction) return undefined;
  return { ...compaction, policy: { ...compaction.policy, overhead } };
}

/**
 * Steps a delegated run gets when its definition declares none.
 *
 * A subagent has no user watching it, so nothing else would end one that loops.
 */
const SUBAGENT_DEFAULT_STEPS = 20;

async function startTurn(
  request: CliRuntimeInvocationRequest,
  dependencies: CliRuntimeInvocationDependencies,
): Promise<CliRuntimeInvocationResult> {
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
  // MCP tools enter the pool only when the user asked for them, and only after
  // a real snapshot: the descriptors say what a server exposes, and inventing
  // them from the config file would advertise tools that may not answer. A
  // failed snapshot registers nothing rather than half a registry — the
  // model is told nothing exists instead of being handed tools that fail.
  const mcp = await mcpToolsForRun(request);
  const registry = dependencies.tools?.() ?? createCoreToolRegistry({
    skills,
    ...(mcp ? { mcpTools: mcp.tools, mcpGateway: mcp.gateway } : {}),
  });
  // Honour disabledTools / hiddenToolPrefixes from user config. Without this the
  // fields are accepted then ignored, so a tool the user disabled still runs.
  const tools = request.runtimeConfig
    ? restrictToolPool(registry, request.runtimeConfig)
    : registry;
  const promptContext = buildPromptContext(request, skills, [...tools.keys()]);
  // What the request spends outside the conversation. Computed here because this
  // is the only place both facts exist: the instruction as it will be sent, and
  // the declarations of the tools actually in the pool after the user's own
  // filters have been applied. The compaction policy needs it for the estimate
  // it falls back to before any request has reported its usage, which is the
  // cold start — the moment those two are the bulk of the request.
  const compaction = withRequestOverhead(request.compaction, {
    systemPrompt: buildSystemPrompt(request.agentMode, promptContext),
    tools: toolSchemas(tools),
  });
  // The step and the tool set both exist here, so this is where a subagent's
  // run can be bound. The tool layer receives a function and never the model
  // side, which is what keeps a provider out of a layer that has no business
  // holding one.
  // One step for the whole invocation. A second one would be a second provider
  // resolution, and the run and its subagents would not necessarily be talking
  // to the same model. The step and the budget are handed over as a host; the
  // turn composes the runner from its own gate, so the user's refusals reach a
  // subagent's tool calls too.
  const step = request.providerMode === "synthetic"
    ? createSyntheticStep({ toolIntent: syntheticToolIntent() })
    : (dependencies.createStep ?? createProviderStep)(request, tools, promptContext);

  const run = runTurn({
    commandEnv: commandEnvironmentFor(request),
    subagentHost: {
      step,
      defaultMaxSteps: SUBAGENT_DEFAULT_STEPS,
    },
    sessionId: request.sessionId,
    // The directory the session writes to, so a consumer of the event stream can
    // find the transcript without reconstructing the layout itself. Omitted when the
    // session's files are not where the default layout says, in which case there is
    // nothing true to report.
    ...sessionPathOption(request.sessionId),
    prompt: request.prompt,
    ...(request.attachments ? { attachments: request.attachments } : {}),
    workspaceRoot: request.workspaceRoot,
    agentMode: request.agentMode,
    permissionScope: request.permissionScope,
    escalationPromptHandler: request.escalationPromptHandler,
    interactiveAsk: request.interactiveAsk,
    history: request.historyMessages ?? [],
    onMessage: request.onTurnMessage ?? (() => {}),
    step,
    tools,
    hooks,
    maxSteps: request.maxTurns,
    compaction,
    signal: request.signal,
    // Read once per run: a policy that changed mid-run would make the number of
    // retries depend on when the config was reloaded rather than on what the
    // user asked for.
    retry: {
      enabled: request.runtimeConfig?.retryEnabled,
      maxRetries: request.runtimeConfig?.retryMaxRetries,
      baseDelayMs: request.runtimeConfig?.retryBaseDelayMs,
      maxDelayMs: request.runtimeConfig?.retryMaxDelayMs,
    },
    denyRules: request.runtimeConfig?.denyRules ?? [],
    ...(request.runtimeConfig?.steeringMode ? { steeringMode: request.runtimeConfig.steeringMode } : {}),
    ...(request.runtimeConfig?.followUpMode ? { followUpMode: request.runtimeConfig.followUpMode } : {}),
  });
  return { events: run.events, input: run };
}

/**
 * What a command the model runs should know about the session it runs in.
 *
 * Resolved here, once per turn, because this is where the workspace, the session
 * id and the resolved provider are all in hand. Each value is read fresh rather
 * than cached for the session: switching model or reasoning level mid-session
 * has to reach the next command, not the one after a restart.
 *
 * A value that cannot be resolved is left out rather than sent empty. A command
 * cannot tell an empty session id from a missing one, and would report the
 * former as fact.
 */
function commandEnvironmentFor(request: CliRuntimeInvocationRequest): Record<string, string> {
  const facts: Record<string, string> = {};
  const sessionId = request.sessionId?.trim();
  if (sessionId) facts.sessionId = sessionId;

  if (sessionId) {
    try {
      const layout = createSessionStoreLayout();
      const file = locateExistingSessionLayout(layout, sessionId);
      if (file.transcriptPath) facts.sessionFile = file.transcriptPath;
    } catch {
      // A session file that cannot be located is not a reason to withhold the
      // rest of the facts.
    }
  }

  const resolution = request.providerCredentialResolution;
  if (resolution.provider) facts.provider = resolution.provider;
  if (resolution.model) facts.model = resolution.model;

  try {
    const effort = getThinkingEffort(request.workspaceRoot);
    if (effort) facts.reasoningLevel = effort;
  } catch {
    // No recorded level means the provider decides; nothing to report.
  }

  return commandEnvironment(process.env, facts) as Record<string, string>;
}

/**
 * The fetch every provider request goes through.
 *
 * A host with no configured timeouts still gets the built-in ones, which is the
 * point of wiring this in at all: the live path previously used the global fetch
 * and therefore had no deadline whatsoever.
 */
function providerFetch(runtimeConfig: RuntimeConfig | undefined): typeof fetch {
  return providerFetchFromTimeouts(providerTimeoutsFrom(runtimeConfig));
}

/**
 * The session's directory as a turn option, or nothing when it cannot be located.
 *
 * Resolved rather than assumed: a session created against a non-default store is the
 * case this exists for, and reporting the default path there would be worse than
 * reporting nothing.
 */
function sessionPathOption(sessionId: string): { readonly sessionPath: string } | Record<string, never> {
  // Only a directory that exists is reported. The locator returns a path whether or
  // not the session has been written, and reporting one that is not there would tell
  // a consumer to look somewhere with nothing in it.
  try {
    const candidate = locateExistingSessionLayout(createSessionStoreLayout(), sessionId).sessionDir;
    return fs.existsSync(candidate) ? { sessionPath: candidate } : {};
  } catch {
    return {};
  }
}

/**
 * The endpoint kind a provider is reached through, when the catalog names one.
 *
 * Read once per step function, like the request shape: a run that changed
 * endpoint mid-answer would send half a reply to one protocol and half to
 * another.
 */


function createProviderStep(
  request: CliRuntimeInvocationRequest,
  tools: ReadonlyMap<string, ToolDefinition>,
  promptContext: SystemPromptContext,
): StepFunction {
  const resolution = request.providerCredentialResolution;
  // Read once for the whole step function, not once per use: loading the
  // catalogue touches the filesystem, and a run that reloaded it mid-turn could
  // change request shape between two steps of the same answer.
  const catalog = loadCatalog();
  const endpoint = providerEndpoint(catalog, resolution.provider);
  return createStepFunction({
    provider: {
      // Built from the whole credential, not from its key alone. An account login
      // yields a token instead of a key, and formatting the header here from a
      // field it does not have is what sent an empty bearer.
      headers: providerAuthorization({
        apiKey: resolution.credential?.apiKey,
        accountAuth: accountAuthFor(resolution.provider, resolution.credential ?? {}),
        ...(endpoint ? { endpoint } : {}),
      }).headers,
      baseUrl: resolution.baseUrl ?? resolution.credential?.baseUrl ?? "",
      model: resolution.model ?? resolution.credential?.model ?? "",
      // The catalog is keyed by provider id, so the request shape cannot be
      // resolved without it.
      provider: resolution.provider,
      // Which endpoint kind this provider is reached through. Read from the
      // catalog rather than inferred from the provider id: the id names who
      // answers, and an endpoint is how they want to be asked.
      ...(endpoint ? { endpoint } : {}),
    },
    // Without this the request is sent with the global fetch, which has no
    // deadline: a provider that accepts the connection and then never answers
    // leaves the turn waiting forever, and the retry layer cannot rescue it
    // because it classifies a failure only after a response arrives.
    // The endpoint decides how its requests are authenticated, and for two of
    // them that is not a constant header: one signs, one carries a token that
    // expires. Both are applied by the transport, which is the only place a
    // request exists whole.
    fetchImpl: providerFetchForEndpoint(request.runtimeConfig, endpoint, endpointShape),
    workspaceRoot: request.workspaceRoot,
    sessionId: request.sessionId,
    systemPrompt: buildSystemPrompt(request.agentMode, promptContext),
    tools: toolSchemas(tools),
    catalog,
    // Sampling settings travel with the request, not with the provider: a
    // provider that ignores them still receives a well-formed request, and a
    // run that sets none keeps the step's own defaults.
    temperature: request.runtimeConfig?.temperature,
    topP: request.runtimeConfig?.topP,
    maxOutputTokens: request.runtimeConfig?.maxOutputTokens,
    retry: {
      enabled: request.runtimeConfig?.retryEnabled,
      maxRetries: request.runtimeConfig?.providerRetryMaxRetries,
      baseDelayMs: request.runtimeConfig?.retryBaseDelayMs,
      maxDelayMs: request.runtimeConfig?.retryMaxDelayMs,
    },
  });
}

function restrictToolPool(
  registry: ReadonlyMap<string, ToolDefinition>,
  runtimeConfig: RuntimeConfig,
): ReadonlyMap<string, ToolDefinition> {
  // A name in the allowlist that matches no tool is a typo, and a typo here is
  // invisible: the run simply offers fewer tools than intended and the model
  // works around it. Reported rather than rejected, because a shared config may
  // legitimately name a tool this build does not have.
  const unknown = (runtimeConfig.allowedTools ?? []).filter((name) => !registry.has(name));
  if (unknown.length > 0) {
    createComponentLogger("tools").warn(
      `Ignoring ${unknown.length} name(s) in allowedTools that match no tool: ${unknown.join(", ")}.`,
    );
  }

  const visible = new Set(
    filterVisibleToolNames([...registry.keys()], runtimeConfig),
  );
  if (visible.size === registry.size) return registry;
  return new Map([...registry].filter(([name]) => visible.has(name)));
}
