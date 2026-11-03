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
import { resolveProviderCredential } from '../../core/shell/providerCredentials.js';
import { providerCredentialBaseUrl, providerCredentialEndpoint } from '../../core/auth/account/target.js';
import { captureUsageAttribution } from '../../observability/usage/identity.js';
import { DEFAULT_ENDPOINT_KIND } from '../../provider/endpoints/index.js';

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

function recordMeasurement(promptTokens: number, promptIdentity: NonNullable<ShellRuntimeContext['promptIdentity']>, completionTokens?: number): void {
  const { config, catalog } = context.configuration.current;
  const target = resolveProviderCredential({ runtimeConfig: config, pool: { sessionId } });
  const baseUrl = providerCredentialBaseUrl(catalog, target);
  if (!target.model || !baseUrl) throw new Error('The fixture requires a resolved model destination.');
  const endpoint = providerCredentialEndpoint(catalog, target, baseUrl) ?? DEFAULT_ENDPOINT_KIND;
  const endpointId = captureUsageAttribution({ provider: target.provider, model: target.model, baseUrl }).endpointId;
  context.promptIdentity = promptIdentity;
  recordSessionUsage(sessionId, { promptTokens, completionTokens,
    promptIdentity: { ...promptIdentity, provider: target.provider, model: target.model, endpoint, endpointId } });
  expect(getSessionUsage(sessionId).lastPromptTokens).toBe(promptTokens);
}

describe('context selection measurement lifetime', () => {
  it('withdraws the current provider measurement when apply changes the selection', async () => {
    recordMeasurement(9_000, { schemaDigest: 'a'.repeat(64), systemDigest: 'b'.repeat(64) }, 100);
    expect(readStatusFacts(context).contextUsed).toBe(9_000);

    const result = await command('shake', ['apply', 'elide']);

    expect(result).toMatchObject({ kind: 'local', state: { status: 'changed' } });
    expect(context.session.contextSelection).toBeDefined();
    expect(await command('shake', ['status'])).toMatchObject({ kind: 'local', output: expect.stringContaining('1 effective entries selected') });
    expect(getSessionUsage(sessionId).lastPromptTokens).toBeUndefined();
    expect(context.promptIdentity).toBeUndefined();
    expect(readStatusFacts(context).contextUsed).toBeUndefined();

    recordMeasurement(8_000, { schemaDigest: 'i'.repeat(64), systemDigest: 'j'.repeat(64) });
    const repeated = await command('shake', ['apply', 'elide']);
    expect(repeated).toMatchObject({ kind: 'local', state: { status: 'unchanged' } });
    expect(getSessionUsage(sessionId).lastPromptTokens).toBe(8_000);
    expect(getSessionUsage(sessionId).lastPromptIdentity).toMatchObject(context.promptIdentity!);
    expect(context.promptIdentity).toEqual({ schemaDigest: 'i'.repeat(64), systemDigest: 'j'.repeat(64) });
  });

  it('invalidates restore only when it removes a selection and leaves failed operations untouched', async () => {
    await command('shake', ['apply', 'elide']);
    recordMeasurement(7_000, { schemaDigest: 'c'.repeat(64), systemDigest: 'd'.repeat(64) });
    await command('shake', ['restore']);
    expect(getSessionUsage(sessionId).lastPromptTokens).toBeUndefined();
    expect(context.promptIdentity).toBeUndefined();

    recordMeasurement(6_000, { schemaDigest: 'e'.repeat(64), systemDigest: 'f'.repeat(64) });
    const noopRestore = await command('shake', ['restore']);
    expect(noopRestore).toMatchObject({ kind: 'local', state: { status: 'unchanged' } });
    expect(getSessionUsage(sessionId).lastPromptTokens).toBe(6_000);
    expect(getSessionUsage(sessionId).lastPromptIdentity).toMatchObject(context.promptIdentity!);
    expect(context.promptIdentity).toEqual({ schemaDigest: 'e'.repeat(64), systemDigest: 'f'.repeat(64) });

    context.workspaceIssue = 'Workspace roots changed; start a new operation.';
    const revokedRestore = await command('shake', ['restore']);
    expect(revokedRestore).toMatchObject({ kind: 'local', state: { status: 'unchanged' } });
    recordMeasurement(5_000, { schemaDigest: 'g'.repeat(64), systemDigest: 'h'.repeat(64) });
    const failed = await command('shake', ['apply', 'elide']);
    expect(failed).toMatchObject({ kind: 'local', output: expect.stringContaining('Workspace roots changed') });
    expect(getSessionUsage(sessionId).lastPromptTokens).toBe(5_000);
    expect(getSessionUsage(sessionId).lastPromptIdentity).toMatchObject(context.promptIdentity!);
    expect(context.promptIdentity).toEqual({ schemaDigest: 'g'.repeat(64), systemDigest: 'h'.repeat(64) });
  });
});
