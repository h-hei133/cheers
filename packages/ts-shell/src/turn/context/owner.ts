import type { RequestContextOwner } from '../../core/agent/context.js';
import type { PreparedTurnContext, StepOptions } from './contract.js';
import type { AgentMessage } from '../../core/agent/state.js';
import { TurnPreparationError } from './prepare.js';

/** Refresh declarations without adopting history from a retired request owner. */
export function bindTurnContext(prepared: PreparedTurnContext, context: RequestContextOwner): PreparedTurnContext {
  const assertCurrent = () => {
    if (!context.isCurrent()) throw new TurnPreparationError('Request history changed during preparation. No request was sent.', true);
  };
  return Object.freeze({ ...prepared,
    isCurrent: () => context.isCurrent() && prepared.isCurrent(),
    refresh: async (signal?: AbortSignal) => {
      assertCurrent();
      const refreshed = await prepared.refresh(signal);
      assertCurrent();
      return bindTurnContext(refreshed, context);
    },
    reframe: async (options: Pick<StepOptions, 'allowTools' | 'allowedTools' | 'agentMode' | 'requestPurpose'>, signal?: AbortSignal) => {
      assertCurrent();
      const reframed = await prepared.reframe(options, signal);
      assertCurrent();
      return bindTurnContext(reframed, context);
    },
    prepare: async (messages: readonly AgentMessage[], signal?: AbortSignal) => {
      assertCurrent();
      const candidate = await prepared.prepare(messages, signal);
      assertCurrent();
      return bindTurnContext(candidate, context);
    },
  });
}
