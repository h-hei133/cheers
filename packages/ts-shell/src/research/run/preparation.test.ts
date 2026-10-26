import fs from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanupResearch, researchHarness } from '../../test-utils/research.js';
import { parseResearchArgs } from '../../core/commands/research/syntax.js';
import { researchEntryRequest, researchTurnPrompt } from './entry.js';
import { prepareResearchRun } from './preparation.js';
import { currentResearch, readResearch } from './store.js';
import { researchEntryDescriptors, researchTools } from './tools.js';
import { runResearchCommand } from '../command.js';
import { researchPrompt } from './prompts.js';
import type { CommandContext } from '../../core/commands/types.js';

afterEach(cleanupResearch);
const methods: NonNullable<CommandContext['composedPrompt']> = {
  originalInput: 'Question /deep-research /skill:one /skill:two', prose: 'Question',
  skills: ['one', 'two'].map(name => ({ name, identity: `project:/methods/${name}`, source: 'project' as const, digest: 'a'.repeat(64), body: `METHOD ${name}` })),
  modifiers: [{ name: 'evidence', instruction: 'Inspect actual evidence.' }],
};
function request(args: readonly string[], composed?: CommandContext['composedPrompt']) {
  const parsed = parseResearchArgs(args); if (!parsed.ok) throw new Error(parsed.reason);
  return researchEntryRequest(parsed, composed);
}

it('captures a complete prospective entry without changing research, ledger, locks or armed authority', async () => {
  const setup = researchHarness();
  const edit = readResearch(setup.manager, setup.session);
  const files = [edit.bound.layout.metadataPath, edit.bound.layout.statePath, edit.bound.layout.transcriptPath];
  const before = files.map(file => fs.readFileSync(file));
  const created = vi.spyOn(setup.runtime, 'create'), arm = vi.spyOn(setup.runtime, 'arm'), run = vi.spyOn(setup.runtime, 'run');
  const prospective = prepareResearchRun({ scope: edit.bound.scope, goal: edit.bound.state.goal }, request(['--depth', 'deep', '--mode', 'mixed', '--brief', 'brief.md', '--save', 'Question'], methods));
  const prompt = researchTurnPrompt(prospective), descriptors = researchEntryDescriptors(prospective);
  expect(prospective).toMatchObject({ status: 'ready', stage: 'brief', epoch: 0,
    request: { depth: 'deep', mode: 'mixed', briefPath: 'brief.md', save: true, methods: { skills: methods.skills } } });
  expect(Date.parse(prospective.deadlineAt) - Date.parse(prospective.createdAt)).toBe(15 * 60_000);
  expect(prompt).toContain('METHOD one'); expect(prompt).toContain('METHOD two');
  expect(prompt).toContain(`"runId":"${prospective.id}"`); expect(prompt).toContain(`deep-research-${prospective.id}.md`);
  expect(descriptors.map(tool => tool.name)).toEqual(['paper_search', 'document_read', 'research_run', 'research_save']);
  for (const descriptor of descriptors) expect(Object.keys(descriptor).sort()).toEqual(['argsSchema', 'description', 'name']);
  expect(currentResearch(readResearch(setup.manager, setup.session))).toBeUndefined();
  expect(setup.runtime.selected(prospective.id)).toBeUndefined();
  expect(files.map(file => fs.readFileSync(file))).toEqual(before);
  expect(fs.existsSync(edit.bound.layout.stateLockPath)).toBe(false);
  expect(created).not.toHaveBeenCalled(); expect(arm).not.toHaveBeenCalled(); expect(run).not.toHaveBeenCalled();
  expect(setup.progress).toEqual([]);
});

it.each([false, true])('projects the exact admitted first message and full tool descriptors with save=%s', async save => {
  const setup = researchHarness(); const edit = readResearch(setup.manager, setup.session);
  const args = ['--depth', 'deep', '--mode', 'software', ...(save ? ['--save'] : []), 'Question with quoted /model and path /home'];
  const result = await runResearchCommand(args, { cwd: setup.root, projectRoot: setup.root, sessionId: setup.session.id, composedPrompt: methods }, setup.runtime, false);
  const admitted = currentResearch(readResearch(setup.manager, setup.session))!;
  const prospective = prepareResearchRun({ scope: edit.bound.scope, goal: edit.bound.state.goal }, request(args, methods), { id: admitted.id, now: Date.parse(admitted.createdAt) });
  expect(prospective.request).toEqual(admitted.request); expect(prospective.deadlineAt).toBe(admitted.deadlineAt);
  expect(result).toMatchObject({ kind: 'prompt', prompt: researchTurnPrompt(prospective),
    promptMetadata: { source: 'deep-research', researchRunId: admitted.id, researchEpoch: 0 } });
  const actualDescriptors = researchTools(setup.runtime, admitted.id).map(({ name, description, argsSchema }) => ({ name, description, argsSchema }));
  expect(researchEntryDescriptors(prospective)).toEqual(actualDescriptors);
  expect(actualDescriptors.find(tool => tool.name === 'research_run')!.argsSchema.properties).toEqual({ runId: { const: admitted.id } });
  expect(actualDescriptors.some(tool => tool.name === 'research_save')).toBe(save);
  for (const stage of ['brief', 'investigate', 'review', 'report'] as const) {
    expect(researchPrompt(admitted, stage)).toContain('METHOD one'); expect(researchPrompt(admitted, stage)).toContain('METHOD two');
  }
});

it('does not arm or disturb an existing native run while preparing another entry', () => {
  const setup = researchHarness(); const current = setup.runtime.create({ question: 'Existing', depth: 'quick', save: false });
  const edit = readResearch(setup.manager, setup.session), before = fs.readFileSync(edit.bound.layout.statePath);
  const prospective = prepareResearchRun({ scope: edit.bound.scope, goal: edit.bound.state.goal }, request(['New question']));
  researchEntryDescriptors(prospective); researchTurnPrompt(prospective);
  expect(prospective.id).not.toBe(current.id); expect(prospective.ledgerScopeId).toBe(prospective.id);
  expect(setup.runtime.selected(current.id)).toEqual(current); expect(setup.runtime.selected(prospective.id)).toBeUndefined();
  expect(fs.readFileSync(edit.bound.layout.statePath)).toEqual(before);
});

it('retains the captured goal accounting scope and exact fresh-run deadline without changing that goal', () => {
  const setup = researchHarness(), edit = readResearch(setup.manager, setup.session);
  const now = Date.parse('2026-10-26T00:00:00.000Z');
  const goal = { ...edit.bound.scope, schemaVersion: 1, id: 'goal-captured', objective: 'Investigate conditions',
    revision: 3, controlRevision: 2, phase: 'paused', origin: 'user', runOwner: null,
    createdAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString() };
  const before = JSON.stringify(goal);
  const run = prepareResearchRun({ scope: edit.bound.scope, goal }, request(['Question']), { id: 'prospective-id', now });
  expect(run).toMatchObject({ id: 'prospective-id', ledgerScopeId: goal.id, goal: { id: goal.id, controlRevision: 2 } });
  expect(run.createdAt).toBe(new Date(now).toISOString()); expect(run.deadlineAt).toBe(new Date(now + 5 * 60_000).toISOString());
  expect(JSON.stringify(goal)).toBe(before); expect(currentResearch(readResearch(setup.manager, setup.session))).toBeUndefined();
});

it.each([{ args: ['status'] }, { args: ['resume'] }, { args: ['steer', 'Revised question'] }, { args: ['--help', 'Question'] }])('keeps control/help actions outside new-entry preparation: $args', ({ args }) => {
  expect(() => request(args)).toThrow('new investigation');
});
