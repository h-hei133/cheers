import fs from 'node:fs';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { createAdvisorHarness, cleanupAdvisorHarnesses, advisorResult } from '../test-utils/advisor.js';
import { runAdvisorCommand } from './command.js';
import { readGoalEdit, writeGoal } from '../planning/goal/store.js';
import { runTurn } from '../turn/session.js';
import { createCoreToolRegistry } from '../core/tools/registry.js';
import { createDefaultExecutionService } from '../runtime/execution/service.js';
import { HookDispatcher } from '../core/hooks/hookDispatcher.js';
import type { CommandContext } from '../core/commands/types.js';
import * as files from '../session/store/sessionFileStore.js';

afterEach(cleanupAdvisorHarnesses);

it('requires an exact fresh note and refuses repeated manual application', async () => {
  const setup = createAdvisorHarness(); await setup.runtime.capture(setup.boundary('fresh'), async () => advisorResult(), setup.signal);
  const note = setup.runtime.view().notes[0]!;
  expect(() => setup.runtime.apply('not-an-exact-note-id')).toThrow(/stale/);
  const applied = setup.runtime.apply(note.id); expect(applied).toMatchObject({ noteId: note.id, checkpointDigest: note.checkpointDigest });
  expect(applied.prompt).toContain('ordinary execution and permission gates'); expect(applied.prompt).toContain(note.text);
  expect(setup.runtime.view().notes[0]!.submittedAt).toBeDefined(); expect(() => setup.runtime.apply(note.id)).toThrow(/already submitted/);
});

it.each(['transcript', 'new-checkpoint', 'goal-control-cycle', 'configuration', 'off'] as const)('refuses manual apply after %s invalidates the captured authority', async cause => {
  const setup = createAdvisorHarness();
  if (cause === 'goal-control-cycle') writeGoal(setup.manager, setup.session, readGoalEdit(setup.manager, setup.session), { type: 'set', objective: 'Bound objective' });
  await setup.runtime.capture(setup.boundary('first checkpoint'), async () => advisorResult(), setup.signal); const note = setup.runtime.view().notes[0]!;
  if (cause === 'transcript') setup.manager.addTurn(setup.session.id, { role: 'user', content: 'New task input' });
  if (cause === 'new-checkpoint') await setup.runtime.capture({ ...setup.boundary('failed next checkpoint', 2), failed: true }, async () => advisorResult(), setup.signal);
  if (cause === 'goal-control-cycle') { writeGoal(setup.manager, setup.session, readGoalEdit(setup.manager, setup.session), { type: 'pause' }); writeGoal(setup.manager, setup.session, readGoalEdit(setup.manager, setup.session), { type: 'resume' }); }
  if (cause === 'configuration') setup.runtime.configure({ target: 'openai/other-review', every: 1, timeoutMs: 500, mode: 'turn' });
  if (cause === 'off') setup.runtime.setEnabled(false);
  expect(() => setup.runtime.apply(note.id)).toThrow(/stale|paused/); expect(setup.runtime.view().notes[0]!.submittedAt).toBeUndefined();
});

it('manual note application uses the ordinary prompt and denies an actual file write through the existing permission gate', async () => {
  const setup = createAdvisorHarness(); const file = path.join(setup.root, 'denied.txt');
  await setup.runtime.capture(setup.boundary('fresh'), async () => advisorResult('Write denied.txt with changed contents'), setup.signal);
  const note = setup.runtime.view().notes[0]!;
  const command = await runAdvisorCommand(['apply', note.id], { sessionId: setup.session.id, projectRoot: setup.root } as CommandContext, setup.runtime, false);
  expect(command.kind).toBe('prompt'); if (command.kind !== 'prompt') throw new Error('Expected ordinary application prompt');
  expect(command.promptMetadata).toMatchObject({ source: 'advisor-application', noteId: note.id, checkpointDigest: note.checkpointDigest });
  const execution = createDefaultExecutionService(); const write = vi.fn(execution.writeTextFile);
  const ask = vi.fn(async (prompt: { id: string }) => ({ promptId: prompt.id, decision: 'deny' as const, respondedAt: Date.now() }));
  const run = runTurn({ sessionId: setup.session.id, workspaceRoot: setup.root, prompt: command.prompt, history: [], signal: setup.signal,
    agentMode: 'build', permissionScope: 'ask', escalationPromptHandler: ask, maxSteps: 2, hooks: new HookDispatcher(),
    tools: createCoreToolRegistry({ executionService: { ...execution, writeTextFile: write } }), onMessage: () => {},
    step: async messages => messages.some(message => message.role === 'tool') ? { text: 'Write denied', toolCalls: [], stopReason: 'stop' }
      : { text: 'Attempting requested write', toolCalls: [{ id: 'write-denied', name: 'write', args: { path: file, content: 'changed' } }], stopReason: 'stop' } });
  const events = []; for await (const event of run.events) events.push(event);
  expect(ask).toHaveBeenCalledOnce(); expect(write).not.toHaveBeenCalled(); expect(fs.existsSync(file)).toBe(false);
  expect(JSON.stringify(events)).toMatch(/denied|refused/); expect(setup.runtime.view().notes[0]!.submittedAt).toBeDefined();
});

it('busy apply and review do not consume a note or start a request', async () => {
  const setup = createAdvisorHarness(); const runner = vi.fn(async () => advisorResult()); await setup.runtime.capture(setup.boundary('fresh'), runner, setup.signal);
  const note = setup.runtime.view().notes[0]!; const context = { sessionId: setup.session.id, projectRoot: setup.root } as CommandContext;
  expect((await runAdvisorCommand(['apply', note.id], context, setup.runtime, true)).kind).toBe('local');
  expect((await runAdvisorCommand(['review'], context, setup.runtime, true)).kind).toBe('local');
  expect(setup.runtime.view().notes[0]!.submittedAt).toBeUndefined(); expect(runner).toHaveBeenCalledOnce();
});

it('redacts and bounds checkpoint and note text before durable storage or dump', async () => {
  const setup = createAdvisorHarness(); const secret = 'sk-synthetic-FAKE-SECRET-MUST-NOT-PUBLISH';
  await setup.runtime.capture(setup.boundary(`Bearer ${secret}\u001b[31m`), async () => advisorResult(`Bearer ${secret}\u001b[31m\n` + 'a'.repeat(9000)), setup.signal);
  const state = setup.runtime.view(); expect(state.checkpoints[0]!.text).not.toContain(secret); expect(state.notes[0]!.text).not.toContain(secret);
  expect(state.notes[0]!.text.length).toBeLessThanOrEqual(8192); expect(JSON.stringify(state)).not.toContain('\\u001b');
  const dump = await runAdvisorCommand(['dump'], { sessionId: setup.session.id, projectRoot: setup.root } as CommandContext, setup.runtime, false);
  expect(JSON.stringify(dump)).not.toContain(secret);
});

it.each(['goal-control', 'transcript'] as const)('rechecks %s under the apply publication lock before marking or submitting advice', async cause => {
  const setup = createAdvisorHarness(); writeGoal(setup.manager, setup.session, readGoalEdit(setup.manager, setup.session), { type: 'set', objective: 'Locked apply' });
  await setup.runtime.capture(setup.boundary('fresh note'), async () => advisorResult(), setup.signal); const note = setup.runtime.view().notes[0]!;
  const lock = files.withFileLock;
  vi.spyOn(files, 'withFileLock').mockImplementationOnce((target, action) => {
    if (cause === 'goal-control') writeGoal(setup.manager, setup.session, readGoalEdit(setup.manager, setup.session), { type: 'pause' });
    else setup.manager.persistUserPromptBarrier(setup.session.id, 'Changed at apply publication');
    return lock(target, action);
  });
  expect(() => setup.runtime.apply(note.id)).toThrow(); expect(setup.runtime.view().notes[0]!.submittedAt).toBeUndefined();
});
