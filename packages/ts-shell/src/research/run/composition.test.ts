import fs from 'node:fs';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { researchHarness, cleanupResearch, researchBrief } from '../../test-utils/research.js';
import { routeSlashCommand } from '../../core/commands/slashRouter.js';
import { runResearchCommand } from '../command.js';
import { researchPrompt, researchInputDigest } from './prompts.js';
import { decodeResearchState } from './codec.js';
import { readResearch, currentResearch } from './store.js';
import { SessionManager } from '../../session/SessionManager.js';
import { createSubagentRunner } from '../../turn/subagent.js';
import type { StepFunction } from '../../turn/step.js';
import { HookDispatcher } from '../../core/hooks/hookDispatcher.js';

afterEach(cleanupResearch);
function fixture() {
  const setup = researchHarness();
  const skillPaths = ['research-a', 'review-b'].map(name => {
    const file = path.join(setup.root, name, 'SKILL.md'); fs.mkdirSync(path.dirname(file));
    fs.writeFileSync(file, `---\nname: ${name}\ndescription: method\n---\nMETHOD ${name}`); return file;
  });
  const researchCommand = vi.fn((args, context) => runResearchCommand(args, context, setup.runtime, false));
  return { ...setup, context: { cwd: setup.root, projectRoot: setup.root, sessionId: setup.session.id,
    interactive: true, skillOptions: { skillPaths, noSkills: true }, researchCommand }, researchCommand };
}

it.each([
  '/deep-research --mode software --depth deep /skill:research-a /skill:review-b 比较两种架构',
  '请比较两种架构 /deep-research /skill:research-a /skill:review-b\n重点检查可验证证据和反例',
  '请比较 /deep /skill:research-a /skill:review-b 反例',
  '检查示例\n````text\nexample ```` /research /skill:missing\n`````\n/deep-research /skill:research-a /skill:review-b',
])('binds one native research with every skill in durable request and every child stage: %s', async input => {
  const setup = fixture(); const result = await routeSlashCommand(input, setup.context);
  expect(setup.researchCommand).toHaveBeenCalledTimes(1);
  const run = setup.runtime.current()!;
  expect(result).toMatchObject({ kind: 'prompt', promptMetadata: { source: 'deep-research', researchRunId: run.id, originalInput: input } });
  expect(run.request.methods?.skills.map(skill => skill.name)).toEqual(['research-a', 'review-b']);
  for (const stage of ['brief', 'investigate', 'gaps', 'draft', 'review', 'report', 'reconcile'] as const) {
    const prompt = researchPrompt(run, stage);
    expect(prompt).toContain('METHOD research-a'); expect(prompt).toContain('METHOD review-b');
    expect(JSON.parse(prompt.split('Research input: ')[1]!).request.question).toBe(run.request.question);
    expect(prompt).not.toContain('"methods":');
  }
  expect(decodeResearchState(readResearch(setup.manager, setup.session).state)).toBeDefined();
  setup.manager.saveInterrupted(setup.session.id);
  const manager = new SessionManager(); const resumed = manager.tryResume(setup.session.id, setup.root);
  expect(resumed.ok).toBe(true); if (!resumed.ok) throw new Error('Resume failed');
  const retained = currentResearch(readResearch(manager, resumed.session))!;
  expect(retained.request.methods).toEqual(run.request.methods);
  expect(researchInputDigest({ ...run, request: { ...run.request, methods: undefined } })).not.toBe(researchInputDigest(run));
});

it.each([
  '问题 /deep-research status /skill:research-a',
  '问题 /deep-research --save /skill:research-a',
  '问题 /deep-research --depth deep --depth quick /skill:research-a',
  '问题 /deep-research /research /skill:research-a',
  '/deep-research /skill:research-a',
  '问题 /deep-research /skill:missing',
  '问题 /brainstorm --save /deep-research /skill:research-a',
])('refuses invalid composition before native state creation: %s', async input => {
  const setup = fixture(); const result = await routeSlashCommand(input, setup.context);
  expect(result).toMatchObject({ kind: 'local', retryDraft: input });
  expect(setup.researchCommand).not.toHaveBeenCalled(); expect(setup.runtime.current()).toBeUndefined();
});

it('includes every method in actual sequential child model requests while preserving native partial semantics', async () => {
  const setup = fixture();
  await routeSlashCommand('Versioned feature conditions /deep-research /skill:research-a /skill:review-b', setup.context);
  const run = setup.runtime.current()!; const stages: string[] = [];
  const step: StepFunction = async messages => {
    const prompt = messages.map(message => String(message.content)).find(text => text.startsWith('Research stage:'))!;
    expect(prompt).toContain('METHOD research-a'); expect(prompt).toContain('METHOD review-b');
    const stage = /^Research stage: (\w+)/.exec(prompt)![1]!; stages.push(stage);
    const input = JSON.parse(prompt.split('Research input: ')[1]!);
    const value = stage === 'brief' ? researchBrief : stage === 'gaps' ? { gaps: [], covered: [], uncovered: ['q1', 'q2'] }
      : stage === 'review' ? { findings: [], uncovered: ['q1', 'q2'], limitation: 'No source evidence' }
      : stage === 'report' ? { index: input.fragmentIndex, title: input.fragmentSections[input.fragmentIndex], text: 'Evidence missing.',
        claimIds: [], sourceIds: [], inputDigest: input.inputDigest }
      : { summary: 'Evidence missing.', claims: [], covered: [], uncovered: ['q1', 'q2'], limitations: ['No source evidence'] };
    return { text: JSON.stringify(value), toolCalls: [], stopReason: 'stop' };
  };
  const runner = createSubagentRunner({ step, defaultMaxSteps: 2 }, new Map(), { workspaceRoot: setup.root,
    sessionId: setup.session.id, agentMode: 'build', permissionScope: 'ask', hooks: new HookDispatcher(), emit: () => {} });
  const final = await setup.runtime.run(run.id, { taskId: 'composed', workspaceRoot: setup.root, sessionId: setup.session.id, runSubagent: runner });
  expect(final.status, final.stopReason).toBe('partial');
  expect(stages).toEqual(['brief', 'investigate', 'gaps', 'draft', 'review', 'report', 'report', 'report']);
});
