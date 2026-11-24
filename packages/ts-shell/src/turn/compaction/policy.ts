import type { AgentMessage } from '../../core/agent/state.js';
import { sameContext } from '../../core/agent/context.js';
import type { CompactionPolicy } from '../../session/compaction.js';
import { estimateRequestTokens } from '../../session/context.js';
import type { PreparedTurnContext } from '../context/contract.js';
import type { PromptIdentitySnapshot } from '../../observability/usage/model.js';

/** Each estimate is bound to one complete prepared request, including its closing instruction. */
export function capturedCompactionPolicy(policy: CompactionPolicy, prepared: PreparedTurnContext, input: {
  readonly admission?: () => string | undefined;
  readonly onPrepared: (prepared: PreparedTurnContext) => void;
  readonly force?: boolean;
  readonly allowContextOverflow?: boolean;
}): CompactionPolicy {
  const matches = (messages: readonly AgentMessage[], toolsAllowed?: boolean): boolean =>
    sameContext(messages, prepared.sourceMessages) && (toolsAllowed === undefined || toolsAllowed === prepared.allowTools);
  const estimate = (messages: readonly AgentMessage[], toolsAllowed?: boolean): number => {
    if (!matches(messages, toolsAllowed)) throw new Error('Compaction estimate does not match its prepared history.');
    return prepared.prompt.measured ? estimateRequestTokens(prepared.budgetMessages, prepared.overhead) : prepared.prompt.tokens;
  };
  return Object.freeze({ ...policy,
    contextWindow: prepared.contextWindow ?? policy.contextWindow,
    inputLimit: prepared.inputLimit,
    outputTokens: prepared.outputTokens,
    reserveTokens: prepared.reserveTokens ?? 0,
    ...(input.force ? { enabled: true } : {}),
    overhead: prepared.overhead,
    promptIdentity: prepared.promptIdentity,
    preparedIdentity: prepared.promptIdentity.wireHistoryDigest,
    projectMessages: (messages: readonly AgentMessage[]) => {
      if (!matches(messages)) throw new Error('Compaction projection does not match its prepared history.');
      return prepared.budgetMessages;
    },
    estimateContextTokens: estimate,
    measureContextTokens: (messages: readonly AgentMessage[], _identity: PromptIdentitySnapshot | undefined, toolsAllowed?: boolean) =>
      prepared.prompt.measured && matches(messages, toolsAllowed) ? prepared.prompt.tokens : undefined,
    admission: () => input.admission?.()
      ?? (!prepared.isCurrent() ? 'Request declarations changed during compaction.' : undefined),
    prepare: async (messages: readonly AgentMessage[], signal?: AbortSignal, toolsAllowed?: boolean) => {
      signal?.throwIfAborted();
      if (matches(messages, toolsAllowed)) return capturedCompactionPolicy(policy, prepared, input);
      const candidate = await prepared.prepare(messages, signal);
      signal?.throwIfAborted();
      input.onPrepared(candidate);
      const overBudget = !candidate.budget.ok && candidate.budget.reason !== 'unknown';
      const allowedWindowOverflow = input.allowContextOverflow && !candidate.budget.ok
        && candidate.budget.reason === 'window' && candidate.refusal?.inputLimit !== true;
      if ((candidate.refusal || overBudget) && !allowedWindowOverflow) {
        throw new Error('Compaction candidate cannot satisfy the complete request limits.');
      }
      return capturedCompactionPolicy(policy, candidate, input);
    },
  });
}
