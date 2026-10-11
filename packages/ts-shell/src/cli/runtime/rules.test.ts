import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getRuntimeConfig } from '../../config/runtimeConfig.js';
import { createShellRuntimeContext, switchActiveSession } from '../../core/shell/runtimeContext.js';
import { SessionManager } from '../../session/SessionManager.js';
import { installCommandGate, sourceReaderFor } from '../data/access.js';
import { ruleCommandsFor } from './rules.js';
import { contextAttachments } from './attachments.js';
import { contextEntryStillAuthorized } from '../../context/attachment/entry.js';
import type { ToolGateOptions } from '../../turn/tools.js';
import { routeSlashCommand } from '../../core/commands/slashRouter.js';

let root: string;
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'cheers-rule-native-')); vi.stubEnv('HOME', root); vi.stubEnv('USERPROFILE', root); vi.stubEnv('CHEERS_TEST_ROOT', root); });
afterEach(() => { vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); });
function runtime(overrides: Partial<ToolGateOptions> = {}) {
  const manager = new SessionManager();
  const context = createShellRuntimeContext({ cwd: root, originalCwd: root, projectRoot: root, rootMode: 'direct', targetPathBase: root, gitRoot: null,
    gitContext: { insideGit: false, root: null, branch: null, isClean: true }, runtimeConfig: getRuntimeConfig(root), session: manager.createNew(root) });
  let denies: ToolGateOptions['denyRules'] = [];
  installCommandGate(context, () => ({ sessionId: context.session.id, workspaceRoot: root, permissionScope: 'ask', agentMode: 'build', emit: () => {}, denyRules: denies,
    hooks: { dispatch: async () => ({ decision: 'allow' }) } as never,
    escalationPromptHandler: async prompt => ({ promptId: prompt.id, decision: 'allow-once', respondedAt: 1 }), ...overrides }));
  const rules = ruleCommandsFor(context, () => false);
  return { context, manager, rules, deny: () => { denies = [{ tool: 'read', pattern: 'notes.md' }]; } };
}
function proposalId(result: Awaited<ReturnType<ReturnType<typeof ruleCommandsFor>>>) {
  if (result.kind !== 'local') throw new Error('Expected a local proposal.');
  return result.state!.proposalId as string;
}
it('writes an exact retained BOM/CRLF proposal through native approval and refuses replay', async () => {
  const { rules } = runtime();
  fs.writeFileSync(path.join(root, 'AGENTS.md'), '\uFEFFKeep exact user rules.  \r\n');
  const preview = await rules('init', []);
  expect(fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8')).toBe('\uFEFFKeep exact user rules.  \r\n');
  const id = proposalId(preview);
  const result = await rules('init', ['apply', id]);
  expect(result).toMatchObject({ kind: 'local', state: { status: 'committed', verified: true, operationId: expect.any(String) } });
  const bytes = fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8');
  expect(bytes.startsWith('\uFEFFKeep exact user rules.  \r\n')).toBe(true);
  expect(bytes.replace(/\r\n/g, '').includes('\n')).toBe(false);
  expect(await rules('init', ['apply', id])).toMatchObject({ state: { status: 'blocked' } });
  expect(fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8')).toBe(bytes);
});
it('separates denial, stale refusal and post-write uncertainty', async () => {
  const denied = runtime({ escalationPromptHandler: async prompt => ({ promptId: prompt.id, decision: 'deny', respondedAt: 1 }) });
  const id = proposalId(await denied.rules('init', []));
  expect(await denied.rules('init', ['apply', id])).toMatchObject({ state: { status: 'denied' } });
  expect(fs.existsSync(path.join(root, 'AGENTS.md'))).toBe(false);
  fs.writeFileSync(path.join(root, 'AGENTS.md'), 'before\n');
  const approved = runtime();
  const stale = proposalId(await approved.rules('init', []));
  fs.appendFileSync(path.join(root, 'AGENTS.md'), 'external change\n');
  expect(await approved.rules('init', ['apply', stale])).toMatchObject({ state: { status: 'blocked' } });
  expect(fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8')).toBe('before\nexternal change\n');
  const uncertain = runtime({ hooks: { dispatch: async event => { if (event.eventName === 'PostToolUse') throw new Error('publication failed'); return { decision: 'allow' }; } } as never });
  const retained = proposalId(await uncertain.rules('rules', ['propose', 'Keep checks focused']));
  expect(await uncertain.rules('rules', ['apply', retained])).toMatchObject({ state: { status: 'unknown' } });
  expect(fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8')).toContain('Keep checks focused');
  expect(await uncertain.rules('rules', ['apply', retained])).toMatchObject({ state: { status: 'blocked' } });
});
it('rejects source revocation, aggregate overflow and retired sessions on the public attachment path', async () => {
  const { context, manager, deny } = runtime();
  fs.writeFileSync(path.join(root, 'notes.md'), 'exact authorized fixture');
  context.ruleControlsCommand = async (_name, args) => contextAttachments(args, { runtimeContext: context, sessionManager: manager });
  const commandContext = { cwd: root, sessionId: context.session.id, ruleControlsCommand: context.ruleControlsCommand };
  expect(await routeSlashCommand('/context add notes.md --persist session', commandContext)).toMatchObject({ state: { status: 'ok' } });
  const entry = context.contextAttachments![0]!;
  expect(contextEntryStillAuthorized(root, entry, sourceReaderFor(context))).toBe(true);
  for (let index = 0; index < 3; index += 1) {
    fs.writeFileSync(path.join(root, `large-${index}.txt`), 'x'.repeat(128 * 1024));
    expect(await routeSlashCommand(`/context add large-${index}.txt`, commandContext)).toMatchObject({ state: { status: 'ok' } });
  }
  fs.writeFileSync(path.join(root, 'overflow.txt'), 'x'.repeat(128 * 1024));
  expect(await routeSlashCommand('/context add overflow.txt', commandContext)).toMatchObject({ state: { status: 'blocked' } });
  expect(context.transientContextAttachments).toHaveLength(3);
  const read = sourceReaderFor(context);
  deny();
  expect(contextEntryStillAuthorized(root, entry, sourceReaderFor(context))).toBe(false);
  expect(await routeSlashCommand('/context add notes.md', commandContext)).toMatchObject({ state: { status: 'blocked' } });
  switchActiveSession(context, manager.createNew(root));
  expect(() => read('notes.md', 100)).toThrow(/changed/);
  expect(context.transientContextAttachments).toBeUndefined();
});
