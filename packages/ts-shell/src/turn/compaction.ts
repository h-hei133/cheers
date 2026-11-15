import type { AgentLoopConfig, NextStepSnapshot } from '../core/agent/loop.js';
import type { AgentMessage } from '../core/agent/state.js';
import type { RequestContextOwner } from '../core/agent/context.js';
import { sameContext } from '../core/agent/context.js';
import type { PreparedTurnContext } from './context/contract.js';
import { capturedCompactionPolicy } from './compaction/policy.js';
import type { HookDispatcher } from '../core/hooks/hookDispatcher.js';
import { buildCompactionLifecycle } from '../core/shell/compaction.js';
import { historyDigest } from '../context/request/identity.js';
import { compactionErrorMessage } from '../session/compaction/failure.js';
import { createComponentLogger } from '../observability/structuredLogger.js';
import { createCompactionStep, type CompactionPolicy, type CompactionReason,
  type SummarizeHistory, type SummarizeTurnPrefix } from '../session/compaction.js';

export interface CompactionBinding {
  readonly policy: CompactionPolicy;
  readonly summarize: SummarizeHistory;
  readonly summarizeTurnPrefix?: SummarizeTurnPrefix;
}

export interface CompactionSetup extends CompactionBinding {
  readonly authority?: import('../session/compaction/contract.js').CompactionAuthority;
  /** Bind summaries and their budgets to the request that actually needs compaction. */
  readonly forRequest?: (prepared: PreparedTurnContext, admission: () => string | undefined) => CompactionBinding;
  /** Record the accepted checkpoint durably. */
  readonly onCompact: (input: { readonly summary: string; readonly keptMessages: number; readonly tokensBefore: number }) => void;
  /** User-visible notice for a refusal or a safely projected automatic failure. */
  readonly onDeclined?: (message: string) => void;
  /** A safely published threshold compaction left too little context headroom. */
  readonly onDeadEnd?: (message: string) => void;
  readonly reason?: CompactionReason;
}

/** One preparation owner for session admission and subsequent kernel boundaries. */
export function turnCompaction(input: {
  readonly setup: CompactionSetup;
  readonly sessionId: string;
  readonly workspaceRoot: string;
  readonly hooks: HookDispatcher;
  /** Steps this run may take; a run limited to one starts on its closing step. */
  readonly maxSteps: number;
  /**
   * Whether the run has any tool to offer.
   *
   * A closing step only carries its instruction when there were tools to
   * withhold; a run with none is answered directly and the request stays as
   * short as the conversation.
   */
  readonly hasTools: boolean;
  readonly prepared?: boolean;
  readonly converted?: boolean;
}): {
  readonly beforePrompt: (history: readonly AgentMessage[], opening: AgentMessage, signal: AbortSignal) => Promise<readonly AgentMessage[]>;
  readonly beforeStep: NonNullable<AgentLoopConfig['prepareNextStep']>;
  readonly prepareContext: (prepared: PreparedTurnContext, signal: AbortSignal | undefined, context: RequestContextOwner) => Promise<PreparedTurnContext | undefined>;
  readonly recoverContext: (prepared: PreparedTurnContext, signal: AbortSignal | undefined, context: RequestContextOwner) => Promise<PreparedTurnContext | undefined>;
} {
  const { setup } = input;
  const log = createComponentLogger('turn.compaction');
  const prepare = createCompactionStep(setup.policy, {
    summarize: setup.summarize,
    sessionId: input.sessionId,
    summarizeTurnPrefix: setup.summarizeTurnPrefix,
    onCompact: setup.onCompact,
    onDeclined: setup.onDeclined,
    onDeadEnd: setup.onDeadEnd,
    onError: error => { setup.onDeclined?.(`Compaction failed: ${compactionErrorMessage(error, input.workspaceRoot)}`); },
    authority: setup.authority,
    lifecycle: buildCompactionLifecycle({ hooks: input.hooks, sessionId: input.sessionId,
      workspaceRoot: input.workspaceRoot, reason: setup.reason ?? 'threshold' }),
    reason: setup.reason ?? 'threshold',
  });
  const check = (boundary: 'prompt' | 'step' | 'continuation', snapshot: NextStepSnapshot, signal?: AbortSignal) => {
    log.debug('Checking context budget', { boundary, sessionId: input.sessionId, messageCount: snapshot.messages.length });
    return prepare(snapshot, signal);
  };
  const recover = createCompactionStep(setup.policy, { summarize: setup.summarize, sessionId: input.sessionId,
    summarizeTurnPrefix: setup.summarizeTurnPrefix, onCompact: setup.onCompact, onDeclined: setup.onDeclined,
    onError: error => setup.onDeclined?.(`Compaction failed: ${compactionErrorMessage(error, input.workspaceRoot)}`),
    authority: setup.authority, reason: 'overflow', force: true,
    lifecycle: buildCompactionLifecycle({ hooks: input.hooks, sessionId: input.sessionId,
      workspaceRoot: input.workspaceRoot, reason: 'overflow' }) });
  let requestContext: RequestContextOwner | undefined;
  let attempted = false;
  const prepareRequest = async (prepared: PreparedTurnContext, signal: AbortSignal | undefined,
    context: RequestContextOwner, force = false): Promise<PreparedTurnContext | undefined> => {
    if (!context.eligible || setup.policy.enabled === false) return undefined;
    if (!context.isCurrent()) throw new Error('Request history changed before compaction preparation.');
    if (!force) { requestContext = context; attempted = false; }
    else if (!requestContext || attempted) return undefined;
    signal?.throwIfAborted();
    const admission = () => !context.isCurrent() ? 'Live history changed during compaction.'
      : !prepared.isCurrent() ? 'Request target changed during compaction.' : undefined;
    const binding = setup.forRequest?.(prepared, admission) ?? setup;
    signal?.throwIfAborted();
    const refusal = admission();
    if (refusal) throw new Error(refusal);
    let candidate: PreparedTurnContext | undefined;
    const policy = capturedCompactionPolicy(binding.policy, prepared, {
      force, admission,
      onPrepared: captured => { candidate = captured; },
    });
    const update = await (force ? recover : prepare)({ messages: prepared.sourceMessages, toolResults: [],
      toolsAllowed: prepared.allowTools }, signal, policy, binding);
    attempted ||= candidate !== undefined;
    if (!context.isCurrent()) throw new Error('Request history changed during compaction preparation.');
    if (!update?.messages) return undefined;
    if (!candidate || !sameContext(update.messages, candidate.sourceMessages) || !context.accept({ ...candidate.messageProjection,
      sourceMessages: candidate.sourceMessages })) {
      throw new Error('Published compaction could not be accepted by its live request.');
    }
    return candidate;
  };
  return {
    beforePrompt: async (history, opening, signal) => {
      if (input.prepared || input.converted || history.some(message => message.role === 'custom')) return history;
      // The first step carries tools unless the run is limited to that one
      // step, in which case it is already the closing step.
      const update = await check('prompt', { messages: [...history, opening], toolResults: [],
        toolsAllowed: input.maxSteps > 1 && input.hasTools }, signal);
      if (!update?.messages || signal.aborted) return history;
      // Generation clones its input. Keep the exact opening object that the
      // turn projection owns, and let core.prompt append it exactly once.
      const last = update.messages.at(-1);
      if (!last || historyDigest([last]) !== historyDigest([opening])) {
        throw new Error('Compaction did not preserve the current prompt.');
      }
      return update.messages.slice(0, -1);
    },
    beforeStep: (snapshot, signal) => input.prepared || input.converted || snapshot.messages.some(message => message.role === 'custom')
      ? undefined : check(snapshot.message ? 'step' : 'continuation', snapshot, signal),
    prepareContext: (prepared, signal, context) => prepareRequest(prepared, signal, context),
    recoverContext: (prepared, signal, context) => prepareRequest(prepared, signal, context, true),
  };
}
