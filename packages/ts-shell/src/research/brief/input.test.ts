import fs from 'node:fs';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { cleanupResearch, researchBrief, researchHarness } from '../../test-utils/research.js';
import { createSubagentRunner } from '../../turn/subagent.js';
import type { StepFunction } from '../../turn/step.js';
import { createReadToolDefinition } from '../../core/tools/read.js';
import { createDefaultExecutionService } from '../../runtime/execution/service.js';
import { HookDispatcher } from '../../core/hooks/hookDispatcher.js';

afterEach(cleanupResearch);
it.each(['no-read', 'denied', 'truncated', 'complete', 'empty'])('accepts the required brief only after an actual complete authorized read: %s', async scenario => {
  const setup = researchHarness(); const briefPath = 'brief.md';
  fs.writeFileSync(path.join(setup.root, briefPath), scenario === 'truncated' ? 'x'.repeat(60 * 1024) : scenario === 'empty' ? '' : 'Investigate v2 on Linux.\n');
  const created = setup.runtime.create({ question: researchBrief.question, briefPath, depth: 'quick', save: false });
  const stages: string[] = [];
  const step: StepFunction = async messages => {
    const prompt = messages.map(message => String(message.content)).find(text => text.startsWith('Research stage:'))!;
    const stage = /^Research stage: (\w+)/.exec(prompt)![1]!;
    if (messages.length === 2) stages.push(stage);
    if (stage !== 'brief') return { text: '', toolCalls: [], stopReason: 'error', errorMessage: 'Bounded fixture stop after brief acceptance.', retriesExhausted: true };
    if (scenario !== 'no-read' && messages.length === 2) return { text: '', toolCalls: [{ id: 'required-brief', name: 'read', args: { path: briefPath, offset: 1, limit: 1000 } }], stopReason: 'stop' };
    return { text: JSON.stringify(researchBrief), toolCalls: [], stopReason: 'stop' };
  };
  const runner = createSubagentRunner({ step, defaultMaxSteps: 4 }, new Map([['read', createReadToolDefinition(createDefaultExecutionService())]]),
    { workspaceRoot: setup.root, sessionId: setup.session.id, agentMode: 'build', permissionScope: 'ask', hooks: new HookDispatcher(),
      denyRules: scenario === 'denied' ? [{ tool: 'read' }] : [], emit: () => {} });
  const final = await setup.runtime.run(created.id, { taskId: 'brief', sessionId: setup.session.id, workspaceRoot: setup.root, runSubagent: runner });
  expect(final.status).toBe('partial');
  if (scenario === 'complete' || scenario === 'empty') {
    expect(stages).toEqual(['brief', 'investigate']); expect(final.stage).toBe('investigate');
    expect(final.briefInput).toMatchObject({ path: briefPath, childId: final.children[0]!.id, briefRevision: 1, contentHash: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(final.events.some(event => event.detail === 'read (required-brief): returned')).toBe(true);
  } else {
    expect(stages).toEqual(['brief']); expect(final.stage).toBe('brief'); expect(final.brief).toBeUndefined(); expect(final.briefInput).toBeUndefined();
    expect(final.stopReason).toContain('required brief file was not completely read');
    if (scenario === 'denied') expect(final.events.some(event => event.detail === 'read (required-brief): failed or denied')).toBe(true);
    if (scenario === 'no-read') expect(final.sources).toEqual([]);
    if (scenario === 'truncated') expect(final.sources[0]?.status).toBe('truncated');
  }
});
