import fs from 'node:fs';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { createAdvisorHarness, cleanupAdvisorHarnesses } from '../../test-utils/advisor.js';
import { changeSessionWorkspaceRoots, sessionWorkspaceAdmission } from '../../session/continuation/workspace.js';
import { HookDispatcher } from '../../core/hooks/hookDispatcher.js';
import type { ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import type { CollaborationComposition } from './model.js';
import { runDump } from './export.js';
import { digest } from '../../collaboration/contract/value.js';
import { readExportSource } from '../../session/export/source.js';
import { snapshotPreview } from './projection.js';

afterEach(cleanupAdvisorHarnesses);

it('rechecks native attached-root identity after approval before publishing a local dump', async () => {
  const s = createAdvisorHarness(false, false); const attached = path.join(s.directory, 'attached'); fs.mkdirSync(attached);
  s.manager.saveCompleted(s.session.id);
  const registered = changeSessionWorkspaceRoots({ manager: s.manager, session: s.session, busy: () => false,
    action: 'add', target: attached, access: 'write' });
  expect(registered.status, registered.note).toBe('changed'); const session = registered.session!;
  const target = path.join(attached, 'dump.json'); const prior = path.join(s.directory, 'prior-attached');
  const context = { cwd: s.root, projectRoot: s.root, session } as ShellRuntimeContext;
  const host = { context, manager: s.manager, accepted: new Map(), proposals: [], pending: new AbortController(), gate: () => ({
    workspaceRoot: s.root, workspaceRoots: session.workspaceRoots, sessionId: session.id, permissionScope: 'ask',
    admission: () => sessionWorkspaceAdmission(s.manager, session), hooks: new HookDispatcher(), emit() {},
    escalationPromptHandler: async () => { fs.renameSync(attached, prior); fs.mkdirSync(attached); return { decision: 'allow-once' }; },
  }) } as CollaborationComposition;
  const output = await runDump(host, 'save', [target], false, { cwd: s.root, projectRoot: s.root, sessionId: session.id });
  expect(fs.existsSync(target)).toBe(false); expect(fs.existsSync(path.join(prior, 'dump.json'))).toBe(false);
  expect(output).not.toContain('verified file publication');
});
it('bounds large snapshot approvals after redaction and control escaping without changing the bound content', () => {
  const snapshot = { version: 1 as const, consistency: 'partial' as const, cutover: 0,
    entries: [{ id: 'a'.repeat(64), role: 'user' as const, content: 'Bearer SYNTHETIC_SNAPSHOT_SECRET ' + '\u001b'.repeat(20_000) }], warnings: [] };
  const source = JSON.stringify(snapshot); const preview = snapshotPreview(snapshot);
  expect(preview.length).toBeLessThan(4400); expect(preview).not.toContain('SYNTHETIC_SNAPSHOT_SECRET');
  expect(preview).not.toContain('\u001b'); expect(preview).toContain('Display excerpt shortened');
  expect(preview).toContain(digest(snapshot)); expect(preview).toContain(String(Buffer.byteLength(source)));
  expect(JSON.stringify(snapshot)).toBe(source);
});
it('bounds the scrubbed raw approval excerpt while binding and saving the complete source', async () => {
  const s = createAdvisorHarness(false, false);
  s.manager.addTurn(s.session.id, { role: 'user', content: 'Bearer SYNTHETIC_EXPORT_SECRET ' + 'x'.repeat(30_000) });
  s.manager.saveCompleted(s.session.id);
  const source = readExportSource(s.session.id, 2 * 1024 * 1024);
  expect(source.ok).toBe(true); if (!source.ok || source.raw === undefined) throw new Error('missing source');
  const raw = source.raw; const target = path.join(s.root, 'raw.jsonl'); let preview = '';
  const host = { context: { cwd: s.root, projectRoot: s.root, session: s.session }, manager: s.manager,
    accepted: new Map(), proposals: [], pending: new AbortController(), gate: () => ({ workspaceRoot: s.root,
      sessionId: s.session.id, permissionScope: 'ask', hooks: new HookDispatcher(), emit() {},
      escalationPromptHandler: async (prompt: { context: { preview?: string } }) => {
        preview = prompt.context.preview ?? ''; return { decision: 'allow-once' };
      } }) } as CollaborationComposition;
  const output = await runDump(host, 'save', [target], true, { cwd: s.root, sessionId: s.session.id });
  expect(preview.length).toBeLessThan(3000); expect(preview).toContain(digest(raw));
  expect(preview).toContain(String(Buffer.byteLength(raw))); expect(preview).not.toContain('SYNTHETIC_EXPORT_SECRET');
  expect(fs.readFileSync(target, 'utf8')).toBe(raw); expect(output).toContain('verified file publication');
});
