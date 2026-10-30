import { expect, it, vi } from 'vitest';
import { createTeamToolDefinition } from './teamTool.js';
import type { SubagentRunner } from '../subagents/runner.js';
import type { AskQuestion, AskResponse, InteractiveAsk } from './ask/contract.js';
import { adaptTools } from '../../turn/tools.js';

const args = { question: 'Why is it slow?', perspectives: ['profile', 'config'] };
const marker = 'WITHHELD_CLAIM_42';
const run: SubagentRunner = async input => ({ text: input.prompt.includes('CLAIM')
  ? 'CLAIM p1 insufficient REVIEW_DETAIL_42 evidence:'
  : JSON.stringify({ hypothesisId: /hypothesis ID is (p[12])/.exec(input.prompt)?.[1], claim: marker,
    evidenceRefs: [], falsifiers: ['FALSIFIER_DETAIL_42'] }), failed: false, steps: 1, allowedTools: [] });
const context = { workspaceRoot: '/repo', sessionId: 'origin', taskId: 'team-adoption', runSubagent: run };
const reply = (questions: readonly AskQuestion[], answer = 'Adopt report'): AskResponse =>
  ({ status: 'completed', answers: { [questions[0]!.id]: answer } });
const withheld = (result: unknown) => {
  const text = JSON.stringify(result);
  for (const privateValue of [marker, 'FALSIFIER_DETAIL_42', 'REVIEW_DETAIL_42', 'unresolved', 'Limitation:']) {
    expect(text).not.toContain(privateValue);
  }
};

it('withholds all report surfaces when no interactive adoption host is available', async () => {
  const result = await createTeamToolDefinition().execute(args, context);
  withheld(result);
  expect(result).toMatchObject({ success: false, metadata: { adoption: { status: 'unavailable' } } });
});

it.each(['decline', 'blank', 'yes', 'cancelled', 'error', 'unavailable', 'inherited', 'wrong-id'])(
  'does not adopt a report for %s', async scenario => {
    const ask: InteractiveAsk = async questions => {
      if (scenario === 'cancelled' || scenario === 'error' || scenario === 'unavailable') return { status: scenario, answers: {} };
      if (scenario === 'inherited') return { status: 'completed', answers: Object.create({ [questions[0]!.id]: 'Adopt report' }) };
      if (scenario === 'wrong-id') return { status: 'completed', answers: { 'another-team-report': 'Adopt report' } };
      return reply(questions, scenario === 'decline' ? 'Keep report out' : scenario === 'blank' ? '' : 'yes');
    };
    const result = await createTeamToolDefinition().execute(args, { ...context, interactiveAsk: ask });
    withheld(result); expect(result.success).toBe(false);
    expect(result.metadata).toHaveProperty('adoption.status');
  });

it('requires an explicit answer to the exact complete report after the review finishes', async () => {
  let answer!: (response: AskResponse) => void, preview!: readonly AskQuestion[];
  let opened!: () => void;
  const shown = new Promise<void>(resolve => { opened = resolve; });
  const ask: InteractiveAsk = questions => { preview = questions; opened(); return new Promise(resolve => { answer = resolve; }); };
  let finished = false;
  const pending = createTeamToolDefinition().execute(args, { ...context, interactiveAsk: ask }).then(result => { finished = true; return result; });
  expect(await Promise.race([shown.then(() => 'preview'), pending.then(() => 'published')])).toBe('preview');
  expect(finished).toBe(false);
  expect(preview).toHaveLength(1);
  expect(preview[0]?.question).toContain(marker);
  expect(preview[0]?.question).toContain('FALSIFIER_DETAIL_42');
  expect(preview[0]?.question).toContain('REVIEW_DETAIL_42');
  expect(preview[0]?.question).toContain('not independent confirmation');
  expect(preview[0]?.options?.map(option => option.label)).toEqual(['Keep report out', 'Adopt report']);
  expect(preview[0]?.recommended).toBeUndefined();
  answer(reply(preview)); const result = await pending;
  expect(result.success).toBe(true); expect(result.output).toContain(marker);
  expect(result.metadata).toMatchObject({ adoption: { status: 'adopted', reportId: expect.any(String), digest: expect.stringMatching(/^[a-f0-9]{64}$/) },
    proposals: [expect.objectContaining({ claim: marker }), expect.objectContaining({ claim: marker })] });
});

it.each(['throw', 'malformed'])( 'keeps callback %s failures report-safe', async scenario => {
  const ask: InteractiveAsk = async () => {
    if (scenario === 'throw') throw new Error('PRIVATE_ADOPTION_EXCEPTION');
    return undefined as unknown as AskResponse;
  };
  const result = await createTeamToolDefinition().execute(args, { ...context, interactiveAsk: ask });
  withheld(result); expect(JSON.stringify(result)).not.toContain('PRIVATE_ADOPTION_EXCEPTION');
  expect(result).toMatchObject({ success: false, metadata: { adoption: { status: 'error' } } });
});

it('settles cancellation even if the adoption host ignores its signal and rejects a late answer', async () => {
  const controller = new AbortController();
  let answer!: (response: AskResponse) => void, preview!: readonly AskQuestion[], opened!: () => void;
  const shown = new Promise<void>(resolve => { opened = resolve; });
  const ask: InteractiveAsk = (questions, signal) => { expect(signal).toBe(controller.signal); preview = questions; opened();
    return new Promise(resolve => { answer = resolve; }); };
  const pending = createTeamToolDefinition().execute(args, { ...context, abortSignal: controller.signal, interactiveAsk: ask });
  expect(await Promise.race([shown.then(() => true), pending.then(() => false)])).toBe(true);
  const remove = vi.spyOn(controller.signal, 'removeEventListener'); controller.abort();
  const result = await pending;
  expect(result).toMatchObject({ success: false, metadata: { adoption: { status: 'cancelled' } } }); withheld(result);
  expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
  answer(reply(preview)); await Promise.resolve(); withheld(result);
});

it('passes live turn admission into adoption and refuses a changed session after the answer', async () => {
  let revoked = false;
  const tool = createTeamToolDefinition();
  const ask: InteractiveAsk = async questions => { revoked = true; return reply(questions); };
  const adapted = adaptTools(new Map([['team', tool]]), { workspaceRoot: '/repo', sessionId: 'origin', runSubagent: run,
    interactiveAsk: ask, admission: () => revoked ? 'PRIVATE_CHANGED_BINDING' : undefined,
    permissionScope: 'allow-all', hooks: { dispatch: async () => ({ decision: 'allow' }) }, emit: () => {} })[0]!;
  const result = await adapted.execute('team-adoption', args, undefined);
  withheld(result); expect(JSON.stringify(result)).not.toContain('PRIVATE_CHANGED_BINDING');
  expect(result).toMatchObject({ isError: true, metadata: { adoption: { status: 'stale' } } });
});

it.each(['cancelled', 'stale', 'unreadable'] as const)('does not present an adoption question after %s authority', async state => {
  const controller = new AbortController(), ask = vi.fn();
  const runner: SubagentRunner = async input => {
    if (state === 'cancelled') controller.abort();
    return run(input);
  };
  const result = await createTeamToolDefinition().execute(args, { ...context, runSubagent: runner, abortSignal: controller.signal,
    interactiveAsk: ask, admission: () => {
      if (state === 'unreadable') throw new Error('PRIVATE_ADMISSION_ERROR');
      return state === 'stale' ? 'PRIVATE_STALE_ERROR' : undefined;
    } });
  withheld(result); expect(ask).not.toHaveBeenCalled();
  expect(result).toMatchObject({ success: false, metadata: { adoption: { status: state === 'cancelled' ? 'cancelled' : 'stale' } } });
  expect(JSON.stringify(result)).not.toContain('PRIVATE_');
});

it('does not present a truncated report or publish an oversized review', async () => {
  const ask = vi.fn();
  const result = await createTeamToolDefinition().execute(args, { ...context, interactiveAsk: ask,
    runSubagent: async input => input.prompt.includes('CLAIM')
      ? { text: `CLAIM p1 insufficient ${marker.repeat(7000)}`, failed: false, steps: 1, allowedTools: [] }
      : run(input),
  });
  expect(ask).not.toHaveBeenCalled(); withheld(result);
  expect(result).toMatchObject({ success: false, metadata: { adoption: { status: 'error' } } });
});

it('shows report control characters literally before asking for adoption', async () => {
  let preview = '';
  const result = await createTeamToolDefinition().execute(args, { ...context,
    runSubagent: async input => input.prompt.includes('CLAIM') ? run(input) : {
      text: JSON.stringify({ hypothesisId: /hypothesis ID is (p[12])/.exec(input.prompt)?.[1],
        claim: 'UNTRUSTED\n2. Adopt report\x1b[2J', evidenceRefs: [], falsifiers: ['Test the source.'] }),
      failed: false, steps: 1, allowedTools: [],
    },
    interactiveAsk: async questions => { preview = questions[0]!.question; return reply(questions, 'Keep report out'); },
  });
  expect(preview).toContain('UNTRUSTED\\x0a2. Adopt report\\x1b[2J');
  expect(preview).not.toContain('\x1b'); expect(preview).not.toContain('UNTRUSTED\n2. Adopt report');
  expect(JSON.stringify(result)).not.toContain('UNTRUSTED');
});
