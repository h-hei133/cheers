import type { PromptAttachments } from "../../core/shell/sessionRuntime.js";
import type { QueryEvent } from "../../core/query/runtime/events.js";
import type { ProviderCredentialResolution } from "../../core/shell/providerCredentials.js";
import type { EscalationPrompt, EscalationResponse } from "../../sandbox/index.js";
import type { PermissionScope } from "../approval/permissionScope.js";
import type { AskQuestion } from "../../core/tools/ask.js";
import type { SessionMessage } from "../../session/schema/sessionMessage.js";
import { runCliRuntimeInvocation, type CliRuntimeInvocationResult } from "../../entrypoints/cliRuntimeInvocation.js";
import type { CompactionSetup } from "../../turn/session.js";
import type { CacheWarmingRunner } from "../../turn/cacheWarm.js";
import type { CliProviderRuntimeBridge } from "../provider/cliProviderRuntimeBridge.js";
import type { RuntimeConfig } from "../../config/runtimeConfig.js";

export function streamCliRuntimePrompt(input: {
  readonly prompt: string;
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
    sessionId: input.sessionId,
    prompt: input.prompt,
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
  // The input handle only exists once the run has started — the readiness
  // wait comes first. A caller that steers through this shell before then
  // would have its text dropped, so the handle buffers the same way the
  // deferred one inside does: the call is held and delivered when the run
  // it belongs to exists.
  const bufferedSteers: string[] = [];
  const bufferedFollowUps: string[] = [];
  // The run's own input handle once it exists, or nothing while the readiness
  // wait is still pending. Buffered text below is delivered through this.
  const settled = async (): Promise<CliRuntimeInvocationResult | undefined> =>
    started;
  return {
    events,
    input: {
      steer: (text: string) => {
        void settled().then((run) => (run?.input?.steer ? run.input.steer(text) : bufferedSteers.push(text)));
      },
      followUp: (text: string) => {
        void settled().then((run) => (run?.input?.followUp ? run.input.followUp(text) : bufferedFollowUps.push(text)));
      },
      pending: () =>
        // Buffered text is this shell's own while the run has not started, and
        // the run's once it has; a caller reading both gets one coherent queue.
        bufferedSteers.length + bufferedFollowUps.length > 0
          ? { steering: [...bufferedSteers], followUps: [...bufferedFollowUps] }
          : { steering: [], followUps: [] },
      clearQueue: () => {
        const taken = [...bufferedSteers, ...bufferedFollowUps];
        bufferedSteers.length = 0;
        bufferedFollowUps.length = 0;
        return taken;
      },
    },
  };
}
