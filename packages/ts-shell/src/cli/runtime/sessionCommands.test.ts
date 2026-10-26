import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionManager } from '../../session/SessionManager.js';
import { getSessionUsage, recordSessionUsage, resetSessionUsage } from '../../observability/usageTelemetry.js';
import { withConfiguration } from '../../test-utils/configuration.js';
import type { ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import { configurationBinding } from '../../core/shell/configuration.js';
import { readStatusFacts } from '../interactive/sessionFacts.js';
import { sessionCommandFor } from './sessionCommands.js';

let root: string;
let manager: SessionManager;
let context: ShellRuntimeContext;
let sessionId: string;
let command: ReturnType<typeof sessionCommandFor>;

beforeEach(() => {
  fs.mkdirSync('/tmp/cheers-test', { recursive: true });
  root = fs.mkdtempSync('/tmp/cheers-test/session-commands-');
  vi.stubEnv('HOME', root);
  vi.stubEnv('USERPROFILE', root);
  vi.stubEnv('CHEERS_TEST_ROOT', root);
  manager = new SessionManager();
  const created = manager.createNew(root);
  manager.addTurn(created.id, { role: 'user', content: '```text\n' + 'x'.repeat(4096) + '\n```' });
  sessionId = created.id;
  const current = manager.getSession(sessionId)!;
  context = withConfiguration({
    cwd: root,
    projectRoot: root,
    session: current,
    gitContext: { branch: 'main' },
    runtimeConfig: { provider: 'openai', providerCredentials: { openai: { model: 'opus-5' } }, contextWindow: 200_000 },
  } as unknown as ShellRuntimeContext);
  const binding = configurationBinding(context);
  context.configuration.publish(context.configuration.begin(binding), context.configuration.current.config, binding);
  command = sessionCommandFor({ runtimeContext: context, sessionManager: manager,
    sessionRuntime: { getCurrentRunController: () => null } });
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetSessionUsage(sessionId);
  fs.rmSync(root, { recursive: true, force: true });
});

describe('context selection measurement lifetime', () => {
  it('withdraws the current provider measurement when apply changes the selection', async () => {
    recordSessionUsage(sessionId, { promptTokens: 9_000, completionTokens: 100 });
    expect(readStatusFacts(context).contextUsed).toBe(9_000);
    context.promptIdentity = { schemaDigest: 'a'.repeat(64), systemDigest: 'b'.repeat(64) };

    const result = await command('shake', ['apply', 'elide']);

    expect(result).toMatchObject({ kind: 'local', state: { status: 'changed' } });
    expect(context.session.contextSelection).toBeDefined();
    expect(await command('shake', ['status'])).toMatchObject({ kind: 'local', output: expect.stringContaining('1 effective entries selected') });
    expect(getSessionUsage(sessionId).lastPromptTokens).toBeUndefined();
    expect(context.promptIdentity).toBeUndefined();
    expect(readStatusFacts(context).contextUsed).toBeUndefined();

    recordSessionUsage(sessionId, { promptTokens: 8_000 });
    context.promptIdentity = { schemaDigest: 'i'.repeat(64), systemDigest: 'j'.repeat(64) };
    const repeated = await command('shake', ['apply', 'elide']);
    expect(repeated).toMatchObject({ kind: 'local', state: { status: 'unchanged' } });
    expect(getSessionUsage(sessionId).lastPromptTokens).toBe(8_000);
    expect(context.promptIdentity).toEqual({ schemaDigest: 'i'.repeat(64), systemDigest: 'j'.repeat(64) });
  });

  it('invalidates restore only when it removes a selection and leaves failed operations untouched', async () => {
    await command('shake', ['apply', 'elide']);
    recordSessionUsage(sessionId, { promptTokens: 7_000 });
    context.promptIdentity = { schemaDigest: 'c'.repeat(64), systemDigest: 'd'.repeat(64) };
    await command('shake', ['restore']);
    expect(getSessionUsage(sessionId).lastPromptTokens).toBeUndefined();
    expect(context.promptIdentity).toBeUndefined();

    recordSessionUsage(sessionId, { promptTokens: 6_000 });
    context.promptIdentity = { schemaDigest: 'e'.repeat(64), systemDigest: 'f'.repeat(64) };
    const noopRestore = await command('shake', ['restore']);
    expect(noopRestore).toMatchObject({ kind: 'local', state: { status: 'unchanged' } });
    expect(getSessionUsage(sessionId).lastPromptTokens).toBe(6_000);
    expect(context.promptIdentity).toEqual({ schemaDigest: 'e'.repeat(64), systemDigest: 'f'.repeat(64) });

    context.workspaceIssue = 'Workspace roots changed; start a new operation.';
    const revokedRestore = await command('shake', ['restore']);
    expect(revokedRestore).toMatchObject({ kind: 'local', state: { status: 'unchanged' } });
    recordSessionUsage(sessionId, { promptTokens: 5_000 });
    context.promptIdentity = { schemaDigest: 'g'.repeat(64), systemDigest: 'h'.repeat(64) };
    const failed = await command('shake', ['apply', 'elide']);
    expect(failed).toMatchObject({ kind: 'local', output: expect.stringContaining('Workspace roots changed') });
    expect(getSessionUsage(sessionId).lastPromptTokens).toBe(5_000);
    expect(context.promptIdentity).toEqual({ schemaDigest: 'g'.repeat(64), systemDigest: 'h'.repeat(64) });
  });
});
