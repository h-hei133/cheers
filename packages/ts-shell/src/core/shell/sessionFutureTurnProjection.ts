import type { SessionContinuitySnapshot } from "../../session/sessionContinuityTypes.js";
import { profileScope } from '../paths/profile/scope.js';
import {
  DEFAULT_COMPACT_LIVE_CHECKPOINT_STORE,
  getLatestCompactCheckpoint,
  type CompactLiveCheckpointStore,
} from "../../context/compact/checkpoint/compactLiveCheckpoint.js";
import {
  DEFAULT_COMPACT_INJECTION_STATE_STORE,
  type CompactInjectionStateStore,
} from "../../context/compact/injection/compactInjectionState.js";
import { planCompactFutureTurnInjection } from "../../context/compact/injection/compactFutureTurnInjection.js";
import {
  DEFAULT_PROJECT_MEMORY_INJECTION_STATE_STORE,
  type ProjectMemoryInjectionStateStore,
} from "../../memory/projectMemoryInjectionState.js";
import { planProjectMemoryFutureTurnInjection } from "../../memory/projectMemoryFutureTurnInjection.js";
import type { ProjectMemoryStore } from "../../memory/projectMemoryStoreContract.js";

export interface SessionFutureTurnProjectionDependencies {
  readonly compactCheckpointStore?: CompactLiveCheckpointStore;
  readonly compactInjectionStateStore?: CompactInjectionStateStore;
  readonly projectMemoryInjectionStateStore?: ProjectMemoryInjectionStateStore;
  readonly projectMemoryStore?: ProjectMemoryStore;
}

interface InjectionEffect {
  readonly isCurrent: () => boolean;
  readonly apply: () => void;
}

interface PreparedComponent {
  readonly prompt: string;
  readonly effect?: InjectionEffect;
}

export interface PreparedSessionPrompt {
  readonly prompt: string;
  /** Validate all prepared generations and consume them at kernel admission. */
  readonly accept: () => void;
}

export async function buildPromptWithFutureTurnInjections(input: {
  deps: SessionFutureTurnProjectionDependencies;
  sessionId: string;
  prompt: string;
}): Promise<PreparedSessionPrompt> {
  const compact = buildPromptWithCompactInjection(input);
  const memory = await buildPromptWithProjectMemoryInjection({
    deps: input.deps,
    sessionId: input.sessionId,
    prompt: compact.prompt,
  });
  const effects = [compact.effect, memory.effect].filter(
    (effect): effect is InjectionEffect => effect !== undefined,
  );
  // Memory retrieval is asynchronous. Neither component may have been replaced
  // while it ran, even by rearming the same compact checkpoint.
  assertCurrent(effects);
  let accepted = false;
  return {
    prompt: memory.prompt,
    accept() {
      if (accepted) return;
      // Validate both generations before either synchronous state transition.
      assertCurrent(effects);
      for (const effect of effects) effect.apply();
      accepted = true;
    },
  };
}

function assertCurrent(effects: readonly InjectionEffect[]): void {
  if (effects.some(effect => !effect.isCurrent())) {
    throw new Error("Prepared prompt context changed before admission; retry the prompt to use the current context.");
  }
}

function buildPromptWithCompactInjection(input: {
  deps: SessionFutureTurnProjectionDependencies;
  sessionId: string;
  prompt: string;
}): PreparedComponent {
  const sessionScopeId = compactSessionScopeId(input.sessionId);
  const checkpointStore =
    input.deps.compactCheckpointStore ?? DEFAULT_COMPACT_LIVE_CHECKPOINT_STORE;
  const injectionStateStore =
    input.deps.compactInjectionStateStore ??
    DEFAULT_COMPACT_INJECTION_STATE_STORE;
  const checkpoint = getLatestCompactCheckpoint(
    checkpointStore,
    sessionScopeId,
  );
  const injectionState = injectionStateStore.get(sessionScopeId);
  const previousCheckpoint = injectionState.supersededCheckpointIds[0]
    ? checkpointStore.getById(injectionState.supersededCheckpointIds[0])
    : undefined;
  const plan = planCompactFutureTurnInjection({
    mode: "prepare",
    checkpoint,
    previousCheckpoint,
    injectionState,
    markConsumed: injectionStateStore.markConsumed,
  });
  const prompt = plan.shouldInject && plan.injectedContext
    ? [plan.injectedContext, "", "<user_request>", input.prompt, "</user_request>"].join("\n")
    : input.prompt;
  const effect = checkpoint && injectionState.checkpointId === checkpoint.checkpointId &&
    (plan.shouldInject || plan.invalidationReason)
    ? {
        isCurrent: () => injectionStateStore.get(sessionScopeId) === injectionState &&
          getLatestCompactCheckpoint(checkpointStore, sessionScopeId) === checkpoint,
        apply: () => {
          const target = { sessionScopeId, checkpointId: checkpoint.checkpointId };
          if (plan.invalidationReason) {
            injectionStateStore.markInvalid({ ...target, reason: plan.invalidationReason });
          } else {
            injectionStateStore.markConsumed(target);
          }
        },
      }
    : undefined;
  return { prompt, effect };
}

async function buildPromptWithProjectMemoryInjection(input: {
  deps: SessionFutureTurnProjectionDependencies;
  sessionId: string;
  prompt: string;
}): Promise<PreparedComponent> {
  const sessionScopeId = compactSessionScopeId(input.sessionId);
  const injectionStateStore =
    input.deps.projectMemoryInjectionStateStore ??
    DEFAULT_PROJECT_MEMORY_INJECTION_STATE_STORE;
  const injectionState = injectionStateStore.get(sessionScopeId);
  const plan = await planProjectMemoryFutureTurnInjection({
    mode: "prepare",
    memoryStore: input.deps.projectMemoryStore,
    injectionState,
    markConsumed: injectionStateStore.markConsumed,
  });
  const memoryInjectionId = injectionState.memoryInjectionId;
  const effect = memoryInjectionId && (plan.shouldInject || plan.invalidationReason)
    ? {
        isCurrent: () => injectionStateStore.get(sessionScopeId) === injectionState,
        apply: () => {
          const target = { sessionScopeId, memoryInjectionId };
          if (plan.invalidationReason) {
            injectionStateStore.markInvalid({ ...target, reason: plan.invalidationReason });
          } else {
            injectionStateStore.markConsumed({ ...target, provenance: plan.provenance });
          }
        },
      }
    : undefined;
  if (!plan.shouldInject || !plan.injectedContext) {
    return { prompt: input.prompt, effect };
  }
  if (input.prompt.includes("\n\n<user_request>")) {
    return {
      prompt: input.prompt.replace(
        "\n\n<user_request>",
        `\n\n${plan.injectedContext}\n\n<user_request>`,
      ),
      effect,
    };
  }
  return { prompt: [plan.injectedContext, "", input.prompt].join("\n"), effect };
}

function compactSessionScopeId(sessionId: string): string {
  return profileScope(`session:${sessionId}`);
}

interface PromptContinuityReader {
  buildPromptContinuitySnapshot?(sessionId: string, currentPrompt: string): SessionContinuitySnapshot | undefined;
  buildContinuitySnapshot?(sessionId: string): SessionContinuitySnapshot;
}

/** Choose the original session snapshot before the current prompt is persisted. */
export function selectPromptContinuity(
  manager: PromptContinuityReader,
  sessionId: string,
  prompt: string,
  options?: { readonly runtimeSeed?: unknown; readonly continuityState?: SessionContinuitySnapshot; readonly outputMode?: "interactive" | "print" },
): SessionContinuitySnapshot | undefined {
  const continuityBuilder = manager.buildPromptContinuitySnapshot;
  const activeContinuityBuilder = manager.buildContinuitySnapshot;
  const outputMode = options?.outputMode ?? "interactive";
  let continuityState = options?.continuityState;
  if (!continuityState) {
    continuityState =
      !options?.runtimeSeed && outputMode === "interactive"
        ? typeof activeContinuityBuilder === "function"
          ? activeContinuityBuilder.call(
              manager,
              sessionId,
            )
          : typeof continuityBuilder === "function"
            ? continuityBuilder.call(
                manager,
                sessionId,
                prompt,
              )
            : undefined
        : !options?.runtimeSeed && typeof continuityBuilder === "function"
          ? continuityBuilder.call(
              manager,
              sessionId,
              prompt,
            )
          : undefined;
  }
  return continuityState;
}
