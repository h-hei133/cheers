import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SessionManager } from '../SessionManager.js';
import { planContextSelection, selectModelContext } from './selection.js';
import { updateContextSelection } from './state.js';

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'cheers-context-'));
  vi.stubEnv('HOME', root); vi.stubEnv('USERPROFILE', root); vi.stubEnv('CHEERS_TEST_ROOT', root);
});
afterEach(() => { vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); });

it('publishes derived context with legal call pairs while the original transcript stays exact', () => {
  const manager = new SessionManager(); const created = manager.createNew(root);
  manager.addTurn(created.id, { role: 'assistant', content: '', tool_calls: [{ id: 'call', type: 'function', function: { name: 'read', arguments: '{}' } }] });
  manager.addTurn(created.id, { role: 'tool', tool_call_id: 'call', content: 'x'.repeat(4096) });
  const current = manager.getSession(created.id)!;
  const transcript = fs.readFileSync(path.join(manager.getSessionDirPath(created.id), 'transcript.jsonl'));
  const plan = planContextSelection(current, 'elide');
  const saved = updateContextSelection(manager, current, plan.selection);
  const selected = selectModelContext(saved);
  expect(selected[0]?.tool_calls?.[0]?.id).toBe(selected[1]?.tool_call_id);
  expect(selected[1]?.content).toContain('omitted from context');
  expect(manager.getSession(saved.id)!.turns[1]?.content).toHaveLength(4096);
  expect(fs.readFileSync(path.join(manager.getSessionDirPath(created.id), 'transcript.jsonl'))).toEqual(transcript);
  expect(selectModelContext(updateContextSelection(manager, saved, undefined))[1]?.content).toHaveLength(4096);
});

it('refuses stale history, a changed selection and revoked admission without replacing saved state', () => {
  const manager = new SessionManager(); const created = manager.createNew(root);
  manager.addTurn(created.id, { role: 'user', content: '```text\n' + 'x'.repeat(4096) + '\n```' });
  const current = manager.getSession(created.id)!;
  const plan = planContextSelection(current, 'elide');
  expect(() => updateContextSelection(manager, current, plan.selection, () => 'revoked')).toThrow('revoked');
  manager.addTurn(created.id, { role: 'assistant', content: 'new history' });
  expect(() => updateContextSelection(manager, current, plan.selection)).toThrow('Conversation changed');
  const newer = manager.getSession(created.id)!;
  const saved = updateContextSelection(manager, newer, planContextSelection(newer, 'elide').selection);
  expect(() => updateContextSelection(manager, newer, undefined)).toThrow('selection changed');
  expect(manager.getSession(saved.id)?.contextSelection).toEqual(saved.contextSelection);
});
