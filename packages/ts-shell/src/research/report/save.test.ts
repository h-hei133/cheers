import fs from 'node:fs';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { researchHarness, finishResearch, cleanupResearch, fixtureClaim } from '../../test-utils/research.js';
import { researchSaveTool } from './save.js';
import { adaptTools, createToolHooks } from '../../turn/tools.js';
import { executeToolBatch } from '../../core/agent/tools.js';
import { HookDispatcher } from '../../core/hooks/hookDispatcher.js';

afterEach(cleanupResearch);
it('saves only through the prepared approved Add File receipt and refuses existing files or stale approval', async () => {
  const setup = finishResearch(researchHarness()); const target = path.join(setup.root, 'report.md');
  const tool = researchSaveTool(setup.runtime, setup.created.id); const args = { runId: setup.created.id, path: 'report.md' };
  const context = { taskId: 'save', sessionId: setup.session.id, workspaceRoot: setup.root };
  const prepared = tool.prepare!(args, context); expect(prepared.preview).toContain('Add:'); expect(fs.existsSync(target)).toBe(false);
  const selection = prepared.selections!.map(item => item.id);
  const result = await prepared.execute(context, selection, { revision: prepared.selectionRevision });
  expect(result).toMatchObject({ success: true, metadata: { status: 'committed', researchSave: 'committed' } });
  expect(setup.current().save).toMatchObject({ status: 'committed', path: target, operationId: result.metadata!.operationId });
  expect(fs.readFileSync(target, 'utf8')).toContain('[source:s-fixture#l1]');
  expect(() => tool.prepare!(args, context)).toThrow(/exists|overwrite/i);
  const second = tool.prepare!({ ...args, path: 'stale.md' }, context); setup.runtime.pause();
  await expect(second.execute(context, selection, { revision: second.selectionRevision })).rejects.toThrow(/changed/);
  expect(fs.existsSync(path.join(setup.root, 'stale.md'))).toBe(false);
});
it('ordinary plan/read-only/deny hooks prevent saving and never claim committed success', async () => {
  for (const mode of ['plan', 'read-only', 'deny', 'user-deny'] as const) {
    const setup = finishResearch(researchHarness()); const tool = researchSaveTool(setup.runtime, setup.created.id); const pool = new Map([[tool.name, tool]]);
    const gate = { workspaceRoot: setup.root, sessionId: setup.session.id, agentMode: mode === 'plan' ? 'plan' as const : 'build' as const,
      permissionScope: mode === 'read-only' ? 'read-only' as const : mode === 'user-deny' ? 'ask' as const : 'allow-all' as const, hooks: new HookDispatcher(), emit: () => {},
      escalationPromptHandler: async () => ({ decision: 'deny' as const }),
      denyRules: mode === 'deny' ? [{ tool: 'write' }] : [] };
    const result = await executeToolBatch(adaptTools(pool, gate), { role: 'assistant', content: '' },
      [{ id: 'save', name: tool.name, args: { runId: setup.created.id, path: 'denied.md' } }], createToolHooks(gate, pool), 'sequential', undefined, () => {});
    expect(fs.existsSync(path.join(setup.root, 'denied.md'))).toBe(false); expect(setup.current().save.status).toBe(mode === 'read-only' || mode === 'user-deny' ? 'denied' : 'failed');
    expect(String(result.messages[0]?.content)).toMatch(/Blocked|Refused|not permitted|read-only/i);
  }
});
it('shows none for an empty validated uncovered set and refuses saving a visibly truncated native report', () => {
  const claims = [fixtureClaim(), fixtureClaim(undefined, 'q2')];
  const complete = finishResearch(researchHarness(), { claims, draft: { summary: 'Complete question coverage', claims,
    covered: ['q1', 'q2'], uncovered: [], limitations: [] } });
  expect(complete.runtime.snapshot()).toContain('Uncovered subquestions: none.');
  const dense = Array.from({ length: 48 }, (_, index) => ({ ...fixtureClaim(), id: `dense-${index}`, text: 'x'.repeat(4096) }));
  const large = finishResearch(researchHarness(), { claims: dense, draft: { summary: 'Dense retained draft', claims: dense,
    covered: ['q1'], uncovered: ['q2'], limitations: [] } });
  expect(large.runtime.reportProjection()).toMatchObject({ truncated: true, text: expect.stringContaining('Research report projection truncated') });
  const tool = researchSaveTool(large.runtime, large.created.id);
  expect(() => tool.prepare!({ runId: large.created.id, path: 'incomplete.md' }, { taskId: 'save', sessionId: large.session.id, workspaceRoot: large.root })).toThrow(/truncated/);
  expect(fs.existsSync(path.join(large.root, 'incomplete.md'))).toBe(false);
});
