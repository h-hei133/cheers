import {
  DEFAULT_COMPACT_LIVE_CHECKPOINT_STORE,
  getLatestCompactCheckpoint,
  type CompactLiveCheckpointStore,
} from "../context/compactLiveCheckpoint.js";
import {
  DEFAULT_COMPACT_INJECTION_STATE_STORE,
  type CompactInjectionStateStore,
} from "../context/compactInjectionState.js";
import { planCompactFutureTurnInjection } from "../context/compactFutureTurnInjection.js";
import {
  DEFAULT_PROJECT_MEMORY_INJECTION_STATE_STORE,
  type ProjectMemoryInjectionStateStore,
} from "../context/projectMemoryInjectionState.js";
import { planProjectMemoryFutureTurnInjection } from "../context/projectMemoryFutureTurnInjection.js";
import type { ProjectMemoryStore } from "../context/projectMemoryStoreContract.js";

export interface SessionFutureTurnProjectionDependencies {
  readonly compactCheckpointStore?: CompactLiveCheckpointStore;
  readonly compactInjectionStateStore?: CompactInjectionStateStore;
  readonly projectMemoryInjectionStateStore?: ProjectMemoryInjectionStateStore;
  readonly projectMemoryStore?: ProjectMemoryStore;
}

export async function buildPromptWithFutureTurnInjections(input: {
  deps: SessionFutureTurnProjectionDependencies;
  sessionId: string;
  prompt: string;
}): Promise<string> {
  const compactInjectedPrompt = buildPromptWithCompactInjection(input);
  return buildPromptWithProjectMemoryInjection({
    deps: input.deps,
    sessionId: input.sessionId,
    prompt: compactInjectedPrompt,
  });
}

function buildPromptWithCompactInjection(input: {
  deps: SessionFutureTurnProjectionDependencies;
  sessionId: string;
  prompt: string;
}): string {
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
    checkpoint,
    previousCheckpoint,
    injectionState,
    markInjected: ({ sessionScopeId: scopeId, checkpointId }) =>
      injectionStateStore.markInjected({
        sessionScopeId: scopeId,
        checkpointId,
      }),
    markConsumed: ({ sessionScopeId: scopeId, checkpointId }) =>
      injectionStateStore.markConsumed({
        sessionScopeId: scopeId,
        checkpointId,
      }),
    markInvalid: ({ sessionScopeId: scopeId, checkpointId, reason }) =>
      injectionStateStore.markInvalid({
        sessionScopeId: scopeId,
        checkpointId,
        reason,
      }),
  });
  if (!plan.shouldInject || !plan.injectedContext) {
    return input.prompt;
  }
  return [
    plan.injectedContext,
    "",
    "<user_request>",
    input.prompt,
    "</user_request>",
  ].join("\n");
}

async function buildPromptWithProjectMemoryInjection(input: {
  deps: SessionFutureTurnProjectionDependencies;
  sessionId: string;
  prompt: string;
}): Promise<string> {
  const sessionScopeId = compactSessionScopeId(input.sessionId);
  const injectionStateStore =
    input.deps.projectMemoryInjectionStateStore ??
    DEFAULT_PROJECT_MEMORY_INJECTION_STATE_STORE;
  const injectionState = injectionStateStore.get(sessionScopeId);
  const plan = await planProjectMemoryFutureTurnInjection({
    memoryStore: input.deps.projectMemoryStore,
    injectionState,
    markInjected: ({ sessionScopeId: scopeId, memoryInjectionId }) =>
      injectionStateStore.markInjected({
        sessionScopeId: scopeId,
        memoryInjectionId,
      }),
    markConsumed: ({ sessionScopeId: scopeId, memoryInjectionId }) =>
      injectionStateStore.markConsumed({
        sessionScopeId: scopeId,
        memoryInjectionId,
      }),
    markInvalid: ({ sessionScopeId: scopeId, memoryInjectionId, reason }) =>
      injectionStateStore.markInvalid({
        sessionScopeId: scopeId,
        memoryInjectionId,
        reason,
      }),
  });
  if (!plan.shouldInject || !plan.injectedContext) {
    return input.prompt;
  }
  if (input.prompt.includes("\n\n<user_request>")) {
    return input.prompt.replace(
      "\n\n<user_request>",
      `\n\n${plan.injectedContext}\n\n<user_request>`,
    );
  }
  return [plan.injectedContext, "", input.prompt].join("\n");
}

function compactSessionScopeId(sessionId: string): string {
  return `session:${sessionId}`;
}
