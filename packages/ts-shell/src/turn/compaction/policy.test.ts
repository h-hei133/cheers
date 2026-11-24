import { expect, it } from 'vitest';
import type { AgentMessage } from '../../core/agent/state.js';
import type { PreparedTurnContext } from '../context/contract.js';
import { capturedCompactionPolicy } from './policy.js';

const sourceMessages: AgentMessage[] = [{ role: 'user', content: 'Source history.' }];
const candidateMessages: AgentMessage[] = [{ role: 'user', content: 'Compacted history.' }];

function captured(budget: { readonly ok: boolean; readonly reason: string },
  refusal?: { readonly detail: string; readonly inputLimit?: boolean }): PreparedTurnContext {
  const prepared = {
    sourceMessages: candidateMessages,
    allowTools: true,
    budget,
    ...(refusal ? { refusal } : {}),
    prompt: { tokens: 10, measured: false },
    promptIdentity: { wireHistoryDigest: 'candidate' },
    isCurrent: () => true,
  };
  return prepared as unknown as PreparedTurnContext;
}

function policyFor(candidate: PreparedTurnContext, allowContextOverflow?: boolean) {
  const source = {
    sourceMessages,
    allowTools: true,
    prompt: { tokens: 20, measured: false },
    budgetMessages: sourceMessages,
    overhead: {},
    promptIdentity: { wireHistoryDigest: 'source' },
    isCurrent: () => true,
    prepare: async () => candidate,
  } as unknown as PreparedTurnContext;
  return capturedCompactionPolicy({ contextWindow: 1000 }, source, {
    onPrepared: () => {},
    ...(allowContextOverflow ? { allowContextOverflow } : {}),
  });
}

it('allows a manual candidate that exceeds the context window', async () => {
  const policy = policyFor(captured({ ok: false, reason: 'window' }, { detail: 'Context overflow.' }), true);
  await expect(policy.prepare!(candidateMessages)).resolves.toMatchObject({ contextWindow: 1000 });
});

it.each([
  { label: 'input token ceiling', budget: { ok: false, reason: 'input' }, refusal: { detail: 'Context overflow.' } },
  { label: 'serialized input ceiling', budget: { ok: false, reason: 'window' }, refusal: { detail: 'Request input is too large.', inputLimit: true } },
])('rejects a manual candidate refused by the $label', async ({ budget, refusal }) => {
  const policy = policyFor(captured(budget, refusal), true);
  await expect(policy.prepare!(candidateMessages)).rejects.toThrow('Compaction candidate cannot satisfy the complete request limits.');
});

it('keeps automatic candidates with a context-window overflow refused', async () => {
  const policy = policyFor(captured({ ok: false, reason: 'window' }, { detail: 'Context overflow.' }));
  await expect(policy.prepare!(candidateMessages)).rejects.toThrow('Compaction candidate cannot satisfy the complete request limits.');
});
