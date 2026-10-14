import { afterEach, expect, it, vi } from 'vitest';
import { createAdvisorHarness, cleanupAdvisorHarnesses, advisorResult } from '../test-utils/advisor.js';
import { runTurn } from '../turn/session.js';
import { HookDispatcher } from '../core/hooks/hookDispatcher.js';
import type { StepFunction } from '../turn/step.js';
import { readAdvisor } from './store.js';
import type { AdvisorBoundary } from './model.js';

afterEach(cleanupAdvisorHarnesses);

it('retains skipped-cadence original tool evidence in a later review after pruning', async () => {
  const setup = createAdvisorHarness({ target: 'openai/review-model', every: 2, timeoutMs: 500, mode: 'turn' });
  const runner = vi.fn(async () => advisorResult()); const first = setup.boundary('ORIGINAL_TOOL_EVIDENCE_BEFORE_PRUNE');
  await setup.runtime.capture(first, runner, setup.signal); expect(runner).not.toHaveBeenCalled();
  first.messages[1]!.content = '[pruned after checkpoint]';
  await setup.runtime.capture(setup.boundary('SECOND_CHECKPOINT_WITHOUT_PRIOR_TOOL_RESULT', 2), runner, setup.signal);
  expect(runner).toHaveBeenCalledOnce();
  expect(runner.mock.calls[0]![0].prompt).toContain('ORIGINAL_TOOL_EVIDENCE_BEFORE_PRUNE');
  expect(runner.mock.calls[0]![0].prompt).toContain('SECOND_CHECKPOINT_WITHOUT_PRIOR_TOOL_RESULT');
  const state = readAdvisor(setup.manager, setup.session).advisor;
  expect(state.captured).toBe(2); expect(state.notes[0]!.coverage).toEqual({
    checkpoints: state.checkpoints.map(({ id, digest }) => ({ id, digest })), truncated: false });
});

it('captures every actual native boundary before automatic compaction including the final no-tool answer', async () => {
  const setup = createAdvisorHarness({ target: 'openai/review-model', every: 2, timeoutMs: 500, mode: 'turn' });
  const prompts: string[] = []; let step = 0; let compacted = false;
  const evidence = 'NATIVE_TOOL_RESULT_BEFORE_AUTOMATIC_COMPACTION ' + 'x'.repeat(6000);
  const reviewer: StepFunction = async messages => { prompts.push(messages.map(message => String(message.content)).join('\n')); return { text: 'Check evidence', toolCalls: [], stopReason: 'stop' }; };
  const summarize = async () => {
    expect(readAdvisor(setup.manager, setup.session).advisor.checkpoints[0]!.text).toContain('NATIVE_TOOL_RESULT_BEFORE_AUTOMATIC_COMPACTION');
    expect(prompts).toHaveLength(0); compacted = true; return 'Compacted work without original tool evidence';
  };
  const history = [{ role: 'user' as const, content: 'Earlier inspection' },
    { role: 'assistant' as const, content: '', tool_calls: [{ id: 'old-read', type: 'function' as const, function: { name: 'read', arguments: '{}' } }] },
    { role: 'tool' as const, content: evidence, tool_call_id: 'old-read' }, { role: 'assistant' as const, content: 'Earlier inspection done' }];
  const run = runTurn({ sessionId: setup.session.id, workspaceRoot: setup.root, prompt: 'Review actual work', history, maxSteps: 3,
    agentMode: 'build', permissionScope: 'allow-all', signal: setup.signal,
    tools: new Map([['read', { name: 'read', description: 'read evidence', argsSchema: { type: 'object' }, execute: async () => ({ success: true, output: 'CURRENT_SMALL_TOOL_RESULT' }) }]]),
    subagentHost: { step: reviewer, stepForModel: () => reviewer, defaultMaxSteps: 1 },
    checkpoint: (checkpoint, runner, signal) => setup.runtime.capture({ ...checkpoint, sourcePromptEntryId: setup.sourcePromptEntryId }, runner, signal),
    hooks: new HookDispatcher(), onMessage: message => setup.manager.addTurn(setup.session.id, message),
    step: async messages => {
      if (step++ === 0) return { text: '', toolCalls: [{ id: 'captured-read', name: 'read', args: {} }], stopReason: 'stop' };
      expect(JSON.stringify(messages)).not.toContain('NATIVE_TOOL_RESULT_BEFORE_AUTOMATIC_COMPACTION');
      return { text: `Final after compact=${compacted}`, toolCalls: [], stopReason: 'stop' };
    },
    compaction: { policy: { contextWindow: 1000, reserveTokens: 0, keepRecentTokens: 100 }, summarize, summarizeTurnPrefix: summarize, onCompact: () => {} } });
  const events = []; for await (const event of run.events) events.push(event);
  expect(compacted).toBe(true); expect(events.at(-1)!.type).toBe('query.completed'); expect(prompts).toHaveLength(1);
  expect(prompts[0]).toContain('NATIVE_TOOL_RESULT_BEFORE_AUTOMATIC_COMPACTION');
  const state = setup.runtime.view(); expect(state.checkpoints).toHaveLength(2);
  expect(state.checkpoints.map(item => item.willContinue)).toEqual([true, false]);
  expect(state.checkpoints[1]!.text).toContain('Final after compact=true');
});

it('end mode captures intermediate and failed boundaries while scheduling only successful end boundaries', async () => {
  const setup = createAdvisorHarness({ target: 'openai/review-model', every: 1, timeoutMs: 500, mode: 'end' });
  const runner = vi.fn(async () => advisorResult());
  await setup.runtime.capture(setup.boundary('intermediate'), runner, setup.signal);
  await setup.runtime.capture({ ...setup.boundary('failed', 2, false), failed: true }, runner, setup.signal);
  expect(runner).not.toHaveBeenCalled();
  await setup.runtime.capture(setup.boundary('final', 3, false), runner, setup.signal);
  expect(runner).toHaveBeenCalledOnce(); expect(setup.runtime.view()).toMatchObject({ captured: 3, eligible: 1 });
  expect(runner.mock.calls[0]![0].prompt).toContain('failed');
});

it('bounds retained evidence and declares omitted captures and clipped text in durable note coverage', async () => {
  const setup = createAdvisorHarness({ target: 'openai/review-model', every: 17, timeoutMs: 500, mode: 'turn' });
  const runner = vi.fn(async () => advisorResult());
  for (let step = 1; step <= 17; step++) await setup.runtime.capture(setup.boundary(`evidence-${step} ` + 'x'.repeat(35000), step), runner, setup.signal);
  const state = setup.runtime.view(); expect(state.captured).toBe(17); expect(state.checkpoints).toHaveLength(16);
  expect(state.checkpoints.every(item => item.truncated && item.text.length <= 32768)).toBe(true);
  expect(state.notes[0]!.coverage.truncated).toBe(true); expect(state.notes[0]!.coverage.checkpoints).toHaveLength(16);
  expect(runner.mock.calls[0]![0].prompt).toContain('earlier captures or snapshot text were omitted');
  expect(runner.mock.calls[0]![0].prompt.length).toBeLessThan(37000);
});

it('rejects an unverified prompt origin without dispatching or failing the main turn', async () => {
  const setup = createAdvisorHarness(); const runner = vi.fn(async () => advisorResult());
  await setup.runtime.capture({ ...setup.boundary('evidence'), sourcePromptEntryId: 'missing' }, runner, setup.signal);
  expect(runner).not.toHaveBeenCalled(); expect(setup.runtime.view().checkpoints).toHaveLength(0);
  expect(setup.reports.join('\n')).toContain('main turn continues without advice');
});

it('scrubs encoded tool arguments before checkpoint serialization, storage and advisor dispatch', async () => {
  const setup = createAdvisorHarness(); const prompts: string[] = [];
  const original = setup.boundary('VISIBLE_EVIDENCE');
  const boundary: AdvisorBoundary = { ...original, messages: [...original.messages,
    { role: 'assistant', content: '', tool_calls: [{ id: 'call-1', type: 'function',
      function: { name: 'inspect', arguments: JSON.stringify({ token: 'PRIVATE_ARGUMENT_TOKEN', nested: { password: 'PRIVATE_ARGUMENT_PASSWORD' }, keep: 'VISIBLE_ARGUMENT' }) } }] }] };
  await setup.runtime.capture(boundary, async input => { prompts.push(input.prompt); return advisorResult(); }, setup.signal);
  const stored = JSON.stringify(setup.runtime.view());
  expect(prompts).toHaveLength(1);
  for (const output of [stored, ...prompts]) {
    expect(output).not.toMatch(/PRIVATE_ARGUMENT_(?:TOKEN|PASSWORD)/);
    expect(output).toContain('VISIBLE_ARGUMENT'); expect(output).toContain('VISIBLE_EVIDENCE');
  }
});

it('an asynchronous checkpoint observer failure remains report-safe and cannot fail a successful main answer', async () => {
  const setup = createAdvisorHarness(); const notices: string[] = []; const step: StepFunction = async () => ({ text: 'Primary answer completed', toolCalls: [], stopReason: 'stop' });
  const run = runTurn({ sessionId: setup.session.id, workspaceRoot: setup.root, prompt: 'answer', history: [], maxSteps: 1,
    signal: setup.signal, step, tools: new Map(), hooks: new HookDispatcher(), onMessage: () => {},
    subagentHost: { step, defaultMaxSteps: 1 }, checkpoint: async () => { throw new Error('sk-synthetic-private-callback-error'); },
    checkpointError: message => { notices.push(message); throw new Error('Reporting also failed'); } });
  const events = []; for await (const event of run.events) events.push(event);
  expect(events.at(-1)).toMatchObject({ type: 'query.completed', result: { finalOutput: 'Primary answer completed' } });
  expect(events.some(event => event.type === 'query.failed')).toBe(false); expect(notices).toHaveLength(1);
  expect(notices[0]).toContain('Checkpoint observer failed'); expect(notices[0]).not.toContain('private-callback-error');
});
