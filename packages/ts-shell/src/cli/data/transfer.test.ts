import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getRuntimeConfig } from '../../config/runtimeConfig.js';
import { createShellRuntimeContext, switchActiveSession } from '../../core/shell/runtimeContext.js';
import { SessionManager } from '../../session/SessionManager.js';
import type { ToolGateOptions } from '../../turn/tools.js';
import { dataTransferFor, installDataTransfer } from './transfer.js';

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'cheers-transfer-'));
  vi.stubEnv('HOME', root); vi.stubEnv('USERPROFILE', root); vi.stubEnv('CHEERS_TEST_ROOT', root);
});
afterEach(() => { vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); });

function runtime(overrides: Partial<ToolGateOptions> = {}) {
  const manager = new SessionManager();
  const context = createShellRuntimeContext({ cwd: root, originalCwd: root, projectRoot: root, rootMode: 'direct', targetPathBase: root, gitRoot: null,
    gitContext: { insideGit: false, root: null, branch: null, isClean: true }, runtimeConfig: getRuntimeConfig(root), session: manager.createNew(root) });
  installDataTransfer(context, () => ({ sessionId: context.session.id, workspaceRoot: root, permissionScope: 'ask', agentMode: 'build', emit: () => {},
    hooks: { dispatch: async () => ({ decision: 'allow' }) } as never, escalationPromptHandler: async prompt =>
      ({ promptId: prompt.id, decision: 'allow-once', respondedAt: 1 }), ...overrides }));
  return { manager, context, transfer: dataTransferFor(context)! };
}

it('records ordinary denial without creating the destination, then preserves post-write uncertainty', async () => {
  const denied = runtime({ escalationPromptHandler: async prompt => ({ promptId: prompt.id, decision: 'deny', respondedAt: 1 }) });
  expect(await denied.transfer.write({ path: 'history.json', content: 'exact\n' })).toMatchObject({ outcome: 'denied' });
  expect(fs.existsSync(path.join(root, 'history.json'))).toBe(false);
  const approved = runtime({ hooks: { dispatch: async event => {
    if (event.eventName === 'PostToolUse') throw new Error('result publication failed');
    return { decision: 'allow' };
  } } as never });
  expect(await approved.transfer.write({ path: 'history.json', content: 'exact\n' })).toMatchObject({ outcome: 'unknown' });
  expect(fs.readFileSync(path.join(root, 'history.json'), 'utf8')).toBe('exact\n');
});

it('reads bounded UTF-8 through the source owner and refuses symlinks and a retired session', async () => {
  const { manager, context, transfer } = runtime();
  fs.writeFileSync(path.join(root, 'source'), '\uFEFFraw\r\n');
  expect(await transfer.read({ path: 'source', maxBytes: 32 })).toEqual({ outcome: 'read', content: '\uFEFFraw\r\n' });
  expect(await transfer.read({ path: 'source', maxBytes: 2 })).toMatchObject({ outcome: 'blocked' });
  fs.symlinkSync(path.join(root, 'source'), path.join(root, 'linked'));
  expect(await transfer.read({ path: 'linked', maxBytes: 32 })).toMatchObject({ outcome: 'blocked' });
  switchActiveSession(context, manager.createNew(root));
  expect(await transfer.read({ path: 'source', maxBytes: 32 })).toMatchObject({ outcome: 'blocked' });
  expect(await transfer.write({ path: 'export', content: 'stale' })).toMatchObject({ outcome: 'blocked' });
  expect(fs.existsSync(path.join(root, 'export'))).toBe(false);
});
