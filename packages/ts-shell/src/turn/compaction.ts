import type { AgentLoopConfig, NextStepSnapshot } from '../core/agent/loop.js';
import type { AgentMessage } from '../core/agent/state.js';
import type { HookDispatcher } from '../core/hooks/hookDispatcher.js';
import { buildCompactionLifecycle } from '../core/shell/compaction.js';
import { historyDigest } from '../context/request/identity.js';
import { compactionErrorMessage } from '../session/compaction/failure.js';
import { createComponentLogger } from '../observability/structuredLogger.js';
import { createCompactionStep, type CompactionPolicy, type CompactionReason,
  type SummarizeHistory, type SummarizeTurnPrefix } from '../session/compaction.js';

export interface CompactionSetup {
  readonly authority?: import('../session/compaction/contract.js').CompactionAuthority;
  readonly policy: CompactionPolicy;
  readonly summarize: SummarizeHistory;
  readonly summarizeTurnPrefix?: SummarizeTurnPrefix;
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
}): {
  readonly beforePrompt: (history: readonly AgentMessage[], opening: AgentMessage, signal: AbortSignal) => Promise<readonly AgentMessage[]>;
  readonly beforeStep: NonNullable<AgentLoopConfig['prepareNextStep']>;
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
  return {
    beforePrompt: async (history, opening, signal) => {
      const update = await check('prompt', { messages: [...history, opening], toolResults: [] }, signal);
      if (!update?.messages || signal.aborted) return history;
      // Generation clones its input. Keep the exact opening object that the
      // turn projection owns, and let core.prompt append it exactly once.
      const last = update.messages.at(-1);
      if (!last || historyDigest([last]) !== historyDigest([opening])) {
        throw new Error('Compaction did not preserve the current prompt.');
      }
      return update.messages.slice(0, -1);
    },
    beforeStep: (snapshot, signal) => check(snapshot.message ? 'step' : 'continuation', snapshot, signal),
  };
}
