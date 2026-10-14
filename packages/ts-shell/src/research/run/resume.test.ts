import fs from 'node:fs';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { cleanupResearch, finishResearch, fixtureClaim, researchHarness } from '../../test-utils/research.js';
import { createReadToolDefinition } from '../../core/tools/read.js';
import { createDefaultExecutionService } from '../../runtime/execution/service.js';
import { toolSources } from '../evidence/producer.js';
import { researchReportDigest, reportSections } from './prompts.js';
import { updateRun } from './state.js';
import { createSubagentRunner } from '../../turn/subagent.js';
import type { StepFunction } from '../../turn/step.js';
import { HookDispatcher } from '../../core/hooks/hookDispatcher.js';

afterEach(cleanupResearch);
it.each([{ depth: 'quick' as const, count: 3 }, { depth: 'deep' as const, count: 6 }, { depth: 'quick' as const, count: 1 }])(
  'resumes $depth partial reports with $count retained fragments through actual source reconciliation', async ({ depth, count }) => {
    const harness = researchHarness(); fs.writeFileSync(path.join(harness.root, 'release.md'), 'v2 enabled only on Linux.');
    const read = createReadToolDefinition(createDefaultExecutionService()); const args = { path: 'release.md' };
    const result = await read.execute(args, { taskId: 'original', sessionId: harness.session.id, workspaceRoot: harness.root });
    const source = toolSources({ assistantMessage: { role: 'assistant', content: '' }, call: { id: 'original', name: 'read', args }, args,
      result: { output: result.output!, metadata: result.metadata, isError: false }, isError: false }, 'original', 1)[0]!;
    const claim = fixtureClaim(source);
    const setup = finishResearch(harness, { request: { question: 'Versioned feature conditions', depth, save: true }, sources: [source], claims: [claim],
      draft: { summary: 'Partial bounded evidence', claims: [claim], covered: ['q1'], uncovered: ['q2'], limitations: [] } });
    const fragments = reportSections(setup.finished).slice(0, count).map((title, index) => ({ index, title, text: `Retained fragment ${index}`,
      claimIds: [], sourceIds: [], inputDigest: researchReportDigest(setup.finished) }));
    updateRun(setup.binding, run => ({ ...run, fragments })); setup.runtime.pause(); const resumed = setup.runtime.resume();
    const requests: string[] = [];
    const step: StepFunction = async messages => {
      const prompt = messages.map(message => String(message.content)).find(text => text.startsWith('Research stage:'))!;
      const stage = /^Research stage: (\w+)/.exec(prompt)![1]!; const input = JSON.parse(prompt.split('Research input: ')[1]!) as any;
      if (messages.length === 2) requests.push(stage === 'report' ? `report-${input.fragmentIndex}` : stage);
      if (stage === 'reconcile' && messages.length === 2) return { text: '', toolCalls: [{ id: 're-read', name: 'read', args }], stopReason: 'stop' };
      return { text: JSON.stringify(stage === 'reconcile' ? { sourceIds: [source.id], unavailable: [] }
        : { index: input.fragmentIndex, title: input.fragmentSections[input.fragmentIndex], text: 'Remaining bounded findings.', claimIds: [], sourceIds: [], inputDigest: input.inputDigest }), toolCalls: [], stopReason: 'stop' };
    };
    const runner = createSubagentRunner({ step, defaultMaxSteps: 4 }, new Map([['read', read]]),
      { workspaceRoot: setup.root, sessionId: setup.session.id, agentMode: 'build', permissionScope: 'ask', hooks: new HookDispatcher(), emit: () => {} });
    const final = await setup.runtime.run(resumed.id, { taskId: 'resume', sessionId: setup.session.id, workspaceRoot: setup.root, runSubagent: runner });
    expect(final.status, final.stopReason).toBe('partial'); expect(final.fragments).toHaveLength(depth === 'quick' ? 3 : 6);
    expect(final.fragments.slice(0, count)).toEqual(fragments); expect(final.deadlineAt).toBe(setup.finished.deadlineAt);
    expect(requests).toEqual(count === 1 ? ['reconcile', 'report-1', 'report-2'] : ['reconcile']);
    expect(final.children.filter(child => child.stage === 'reconcile')[0]?.sourceIds).toContain(source.id);
    expect(final.pending).toBeUndefined();
  });
