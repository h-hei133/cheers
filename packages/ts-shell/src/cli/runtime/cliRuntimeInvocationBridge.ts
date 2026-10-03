import type { CoreMcpGateway } from "../../core/mcp/gateway.js";
import type { PromptAttachments } from "../../core/shell/sessionRuntime.js";
import type { QueryEvent } from "../../core/query/runtime/events.js";
import type { ProviderCredentialResolution } from "../../core/shell/providerCredentials.js";
import type { EscalationPrompt, EscalationResponse } from "../../core/shell/approval/contract.js";
import type { PermissionScope } from "../approval/permissionScope.js";
import type { AskQuestion } from "../../core/tools/ask.js";
import type { SessionMessage } from "../../session/schema/sessionMessage.js";
import { runCliRuntimeInvocation, type CliRuntimeInvocationResult } from "../../entrypoints/cliRuntimeInvocation.js";
import type { CompactionSetup } from "../../turn/session.js";
import { pendingTurnInput } from "../../turn/pendingInput.js";
import type { CacheWarmingRunner } from "../../turn/cacheWarm.js";
import type { CliProviderRuntimeBridge } from "../provider/cliProviderRuntimeBridge.js";
import type { RuntimeConfig } from "../../config/runtimeConfig.js";

export function streamCliRuntimePrompt(input: {
  readonly prompt: string;
  readonly continuityContext?: string;
  readonly onPromptAccepted?: () => void;
  readonly mcpGateway?: CoreMcpGateway;
  /** Images that travelled with the prompt; see `PromptAttachments`. */
  readonly attachments?: PromptAttachments;
  readonly sessionId: string;
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
  readonly providerRuntimeBridge: CliProviderRuntimeBridge;
  /** Tool visibility: disabledTools / hiddenToolPrefixes come from here. */
  readonly runtimeConfig?: RuntimeConfig;
  /** Keeping this run's prompt cached between requests, when it does. */
  readonly cacheWarming?: CacheWarmingRunner;
  /** Skill loading the run was started with: named paths, and discovery off. */
  readonly skillOptions?: {
    readonly skillPaths?: readonly string[];
    readonly noSkills?: boolean;
  };
}): CliRuntimeInvocationResult {
  // The turn below is async since MCP tools joined the pool — their snapshot
  // has to be awaited before the first event, and a caller that can only take
  // an event iterator should not have to know that. The events the caller
  // reads start after the snapshot either way, so the promise is folded in
  // here rather than pushed into every caller's signature.
  const started = runCliRuntimeInvocation({
    mcpGateway: input.mcpGateway,
    sessionId: input.sessionId,
    prompt: input.prompt,
    ...(input.onPromptAccepted ? { onPromptAccepted: input.onPromptAccepted } : {}),
    ...(input.continuityContext ? { continuityContext: input.continuityContext } : {}),
    ...(input.attachments ? { attachments: input.attachments } : {}),
    workspaceRoot: input.workspaceRoot,
    signal: input.signal,
    maxTurns: input.maxTurns,
    escalationPromptHandler: input.escalationPromptHandler,
    providerCredentialResolution: input.providerCredentialResolution,
    agentMode: input.agentMode,
    ...(input.permissionScope ? { permissionScope: input.permissionScope } : {}),
    ...(input.interactiveAsk ? { interactiveAsk: input.interactiveAsk } : {}),
    ...(input.historyMessages ? { historyMessages: input.historyMessages } : {}),
    ...(input.onTurnMessage ? { onTurnMessage: input.onTurnMessage } : {}),
    ...(input.compaction ? { compaction: input.compaction } : {}),
    providerModeEnv: input.providerRuntimeBridge.providerModeEnv(),
    ...(input.runtimeConfig ? { runtimeConfig: input.runtimeConfig } : {}),
    ...(input.skillOptions ? { skillOptions: input.skillOptions } : {}),
    ...(input.cacheWarming ? { cacheWarming: input.cacheWarming } : {}),
  });
  const events = (async function* (): AsyncIterable<QueryEvent> {
    yield* (await started).events;
  })();
  // Input typed before the run exists is held and delivered when it does; see
  // `pendingTurnInput`. Adoption is not awaited, so steering is not delayed by
  // the readiness check. A run that fails never produces a handle, and its
  // failure already reaches the caller through the event stream — so nothing is
  // reported from this branch, and the buffer stays intact rather than feeding
  // a second, unhandled rejection.
  const buffered = pendingTurnInput();
  void started.then(
    (run) => buffered.adopt(run),
    () => {},
  );
  return { events, input: buffered.input };
}
