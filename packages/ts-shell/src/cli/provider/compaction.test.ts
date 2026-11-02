import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getRuntimeConfig } from '../../config/runtimeConfig.js';
import { ConfigState } from '../../config/state.js';
import type { CatalogProvider } from '../../core/models/catalog.js';
import { BUILTIN_PROVIDERS } from '../../core/models/catalog.js';
import { configurationBinding } from '../../core/shell/configuration.js';
import { credentialBlockMessage, type ProviderCredentialResolution } from '../../core/shell/providerCredentials.js';
import type { ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import type { StreamingRenderer } from '../../presentation/terminal/streaming.js';
import { cleanupAdvisorHarnesses, createAdvisorHarness } from '../../test-utils/advisor.js';
import { createCompactionProviders } from './compaction.js';
import { createProviderResources } from './resources.js';
import { providerRequestTarget } from './requestTarget.js';
import { markContextUnknown, recordSessionUsage, resetSessionUsage } from '../../observability/usageTelemetry.js';
import { historyDigest, requestIdentity } from '../../context/request/identity.js';
import { outgoingProjection } from '../../turn/messages.js';
import { captureUsageAttribution } from '../../observability/usage/identity.js';

vi.mock('../../turn/cacheWarm.js', () => ({ createCacheWarmingRunner: () => ({ stop: vi.fn() }) }));

let setup: ReturnType<typeof createAdvisorHarness>;
beforeEach(() => { setup = createAdvisorHarness(false, false); });
afterEach(() => { resetSessionUsage(setup.session.id); cleanupAdvisorHarnesses(); });

const main: ProviderCredentialResolution = { provider: 'openai', model: 'fixture',
  baseUrl: 'https://provider.invalid/v1', expectedEnvVarName: 'OPENAI_API_KEY',
  credential: { provider: 'openai', authMode: 'api-key', apiKey: 'synthetic-compaction-only',
    model: 'fixture', baseUrl: 'https://provider.invalid/v1', source: 'config', envVarName: 'OPENAI_API_KEY' } };
const catalog: readonly CatalogProvider[] = [{ id: 'openai', endpoint: 'openai-compatible',
  baseUrl: main.baseUrl, models: [{ id: 'fixture' }] }];

function fixture() {
  const config = { ...getRuntimeConfig(setup.root), offline: true };
  const binding = configurationBinding({ projectRoot: setup.root, session: setup.session });
  const configuration = new ConfigState(config, binding, catalog);
  const runtimeContext = { projectRoot: setup.root, session: setup.session, configuration } as ShellRuntimeContext;
  const renderer = { renderLine: vi.fn() } as unknown as StreamingRenderer;
  return { config, binding, configuration, runtimeContext, renderer,
    providers: createCompactionProviders({ runtimeContext, renderer }) };
}

it.each(['connection-overridden', 'connection-unavailable', 'connection-pending', 'pool-empty', 'pool-unavailable', 'pool-required'] as const)(
  'keeps %s visible while refusing a compaction provider', blocked => {
    const { providers } = fixture();
    const resolution = { ...main, blocked };
    expect(providers.availability(resolution, catalog)).toEqual({ available: false, reason: credentialBlockMessage(blocked) });
    expect(providers.target(resolution, catalog)).toBeUndefined();
    expect(providers.provider(resolution, catalog)).toBeUndefined();
  });

it('distinguishes missing credentials, endpoints and models', () => {
  const { providers } = fixture();
  expect(providers.availability({ ...main, credential: undefined }, catalog))
    .toMatchObject({ available: false, reason: expect.stringContaining('no usable credential') });
  expect(providers.availability({ ...main, baseUrl: undefined,
    credential: { ...main.credential!, baseUrl: undefined } }, []))
    .toMatchObject({ available: false, reason: expect.stringContaining('No endpoint') });
  expect(providers.availability({ ...main, model: undefined,
    credential: { ...main.credential!, model: undefined } }, catalog))
    .toMatchObject({ available: false, reason: expect.stringContaining('No model') });
});

it('reports ambiguous catalogue aliases without selecting either provider', () => {
  const { providers } = fixture();
  const ambiguous = ['a', 'b'].map(id => ({ id, runtime: 'openai' as const, baseUrl: main.baseUrl, models: [{ id: 'fixture' }] }));
  expect(providers.availability(main, ambiguous)).toMatchObject({ available: false,
    reason: expect.stringContaining('More than one model catalogue') });
  expect(providers.provider(main, ambiguous)).toBeUndefined();
});

it('keeps an account endpoint refusal report-safe and does not construct a provider', () => {
  const { providers } = fixture();
  const resolution: ProviderCredentialResolution = { ...main, baseUrl: 'https://untrusted.invalid/synthetic-private-address',
    credential: { ...main.credential!, apiKey: undefined, authMode: 'account-auth',
      accountAuth: { type: 'openai-chatgpt-account', accessToken: 'synthetic-account-token',
        refreshToken: 'synthetic-refresh-token', expiresAt: Date.now() + 60000 } } };
  const availability = providers.availability(resolution, catalog);
  expect(availability).toEqual({ available: false,
    reason: 'The selected provider endpoint cannot be verified against its credential binding.' });
  expect(JSON.stringify(availability)).not.toMatch(/untrusted|synthetic|https:/);
  expect(providers.target(resolution, catalog)).toBeUndefined();
  expect(providers.provider(resolution, catalog)).toBeUndefined();
});

it.each(['bedrock', 'vertex'] as const)('keeps %s signer availability while enforcing blocked admission', provider => {
  const { providers } = fixture();
  const resolution: ProviderCredentialResolution = { provider, model: 'fixture',
    baseUrl: 'https://signer.invalid', expectedEnvVarName: 'SYNTHETIC_KEY' };
  expect(providers.availability(resolution, BUILTIN_PROVIDERS)).toEqual({ available: true });
  expect(providers.provider(resolution, BUILTIN_PROVIDERS)).toMatchObject({ providerId: provider, model: 'fixture' });
  const blocked = { ...resolution, blocked: 'connection-unavailable' as const };
  expect(providers.availability(blocked, BUILTIN_PROVIDERS)).toMatchObject({ available: false });
  expect(providers.provider(blocked, BUILTIN_PROVIDERS)).toBeUndefined();
});

it('binds initial and renewed compaction providers to the exact request target', async () => {
  const { providers, config } = fixture();
  const request = providerRequestTarget({ workspaceRoot: setup.root, sessionId: setup.session.id,
    resolution: main, baseUrl: main.baseUrl!, endpoint: 'openai-compatible' });
  expect(providers.provider(main, catalog)).toMatchObject({ headers: request.headers,
    replayBinding: request.replayBinding, credentialId: request.credentialId, credentialGeneration: request.credentialGeneration });
  const renewed = await providers.renew(main, config, () => undefined, catalog);
  expect(renewed.provider?.replayBinding).toBe(request.replayBinding);
  const changed = { ...main, credential: { ...main.credential!, apiKey: 'synthetic-replaced-key' } };
  expect(providers.provider(changed, catalog)?.replayBinding).not.toBe(request.replayBinding);
});

it('preserves a blocked reason on explicit renewal without preparing executable compaction', async () => {
  const { providers, config, renderer } = fixture();
  const blocked = { ...main, blocked: 'connection-unavailable' as const };
  expect(await providers.renew(blocked, config, () => undefined, catalog, false))
    .toEqual({ failure: credentialBlockMessage(blocked.blocked) });
  expect(renderer.renderLine).not.toHaveBeenCalled();
});

it('publishes current unavailability before the first turn and updates it across provider and catalogue changes', () => {
  const input = fixture();
  let resolution: ProviderCredentialResolution = { ...main, blocked: 'connection-unavailable' };
  const resources = createProviderResources({ ...input, sessionManager: setup.manager,
    providerRuntimeBridge: { resolveCredentialSnapshot: () => resolution } }, input.providers);
  expect(input.runtimeContext.compactionUnavailable?.()).toBe(credentialBlockMessage('connection-unavailable'));
  const prepare = resources.startRun({ config: input.config, catalog, publication: input.configuration.current,
    backgroundSignal: new AbortController().signal, sessionId: setup.session.id,
    admission: () => undefined, getSourceEntryId: () => undefined });
  expect(prepare(resolution).compaction).toBeUndefined();
  resolution = main;
  expect(input.runtimeContext.compactionUnavailable?.()).toBeUndefined();
  const ticket = input.configuration.begin(input.binding);
  const ambiguous = ['a', 'b'].map(id => ({ id, runtime: 'openai' as const, baseUrl: main.baseUrl, models: [{ id: 'fixture' }] }));
  expect(input.configuration.publish(ticket, input.config, input.binding, undefined, ambiguous).status).toBe('applied');
  expect(input.runtimeContext.compactionUnavailable?.()).toContain('More than one model catalogue');
  input.configuration.transition(input.binding);
  expect(input.runtimeContext.compactionUnavailable?.()).toContain('Configuration must be admitted');
});

it('does not expose resolver exception details through an availability report', () => {
  const input = fixture();
  createProviderResources({ ...input, sessionManager: setup.manager,
    providerRuntimeBridge: { resolveCredentialSnapshot: () => { throw new Error('synthetic-private-provider-token'); } } }, input.providers);
  expect(input.runtimeContext.compactionUnavailable?.()).toBe('The provider configuration could not be resolved.');
});

it('reports an unavailable configured summary model while the main target is healthy', () => {
  const input = fixture();
  const config = { ...input.config, sessionModelRoles: { summary: { provider: 'openai' as const,
    connectionId: 'missing-summary-connection', model: 'summary-fixture' } } };
  expect(input.providers.availability(main, catalog)).toEqual({ available: true });
  expect(input.providers.availability(main, catalog, config)).toEqual({ available: false,
    reason: 'The configured summary model is unavailable for compaction.' });
  Object.assign(input.runtimeContext, { configuration: new ConfigState(config, input.binding, catalog) });
  createProviderResources({ ...input, sessionManager: setup.manager,
    providerRuntimeBridge: { resolveCredentialSnapshot: () => main } }, input.providers);
  expect(input.runtimeContext.compactionUnavailable?.()).toBe('The configured summary model is unavailable for compaction.');
});

it('reports main compaction service-tier and provider-owned output refusals with fixed reasons', () => {
  const input = fixture();
  const tier = { ...input.config, sessionServiceTier: { provider: 'openai' as const, model: main.model!, value: 'priority' } };
  expect(input.providers.availability(main, catalog, tier)).toEqual({ available: false,
    reason: 'The selected provider service tier is unavailable for compaction.' });
  const account: ProviderCredentialResolution = { ...main, baseUrl: 'https://chatgpt.com/backend-api',
    credential: { ...main.credential!, apiKey: undefined, authMode: 'account-auth',
      accountAuth: { type: 'openai-chatgpt-account', accessToken: 'synthetic-account-token',
        refreshToken: 'synthetic-refresh-token', expiresAt: Date.now() + 60000 } } };
  expect(input.providers.availability(account, BUILTIN_PROVIDERS, { ...input.config, maxOutputTokens: 42 })).toEqual({ available: false,
    reason: 'The selected provider does not accept the configured output limit for compaction.' });
});

it('reports actual microcompaction evaluator fallback even when the previous provider usage still exists', () => {
  const input = fixture();
  const resources = createProviderResources({ ...input, sessionManager: setup.manager,
    providerRuntimeBridge: { resolveCredentialSnapshot: () => main } }, input.providers);
  const prepare = resources.startRun({ config: input.config, catalog, publication: input.configuration.current,
    backgroundSignal: new AbortController().signal, sessionId: setup.session.id,
    admission: () => undefined, getSourceEntryId: () => undefined });
  const compaction = prepare(main).compaction!;
  const messages = [{ role: 'user' as const, content: 'read' }, { role: 'assistant' as const, content: '', tool_calls: [
    { id: 'read-1', type: 'function' as const, function: { name: 'read', arguments: '{}' } },
  ] }, { role: 'tool' as const, tool_call_id: 'read-1', content: 'result '.repeat(1000) }];
  const provider = input.providers.provider(main, catalog)!;
  const identity = { provider: main.provider, model: main.model!, endpoint: provider.endpoint,
    ...requestIdentity({ tools: [] }), historyDigest: historyDigest(messages),
    wireHistoryDigest: historyDigest(outgoingProjection(messages, false).messages), wireMessageCount: messages.length,
    replayBinding: provider.replayBinding };
  recordSessionUsage(setup.session.id, { promptTokens: 900, promptMessageCount: messages.length, promptIdentity: identity,
    attribution: captureUsageAttribution({ provider: main.provider, model: main.model!, baseUrl: main.baseUrl! }) });
  expect(input.runtimeContext.compactionMeasurement?.()).toBeUndefined();
  expect(compaction.policy.measureContextTokens?.(messages, identity)).toBe(900);
  expect(input.runtimeContext.compactionMeasurement?.()).toEqual({ source: 'measured' });
  const tail = Array.from({ length: 4 }, (_, index) => [{ role: 'user' as const, content: `next ${index}` },
    { role: 'assistant' as const, content: 'answer' }]).flat();
  expect(compaction.policy.measureContextTokens?.([...messages, ...tail], identity)).toBeUndefined();
  expect(input.runtimeContext.compactionMeasurement?.()).toEqual({ source: 'estimated',
    reason: 'The compaction evaluator could not use a current provider measurement.' });
  expect(compaction.policy.measureContextTokens?.(messages, identity)).toBe(900);
  expect(input.runtimeContext.compactionMeasurement?.()).toEqual({ source: 'measured' });
  markContextUnknown(setup.session.id);
  expect(input.runtimeContext.compactionMeasurement?.()).toBeUndefined();
  recordSessionUsage(setup.session.id, { promptTokens: 900, promptMessageCount: messages.length, promptIdentity: identity,
    attribution: captureUsageAttribution({ provider: main.provider, model: main.model!, baseUrl: main.baseUrl! }) });
  expect(compaction.policy.measureContextTokens?.(messages, identity)).toBe(900);
  expect(input.runtimeContext.compactionMeasurement?.()).toEqual({ source: 'measured' });
  input.runtimeContext.promptIdentity = { ...identity };
  expect(input.runtimeContext.compactionMeasurement?.()).toBeUndefined();
  expect(compaction.policy.measureContextTokens?.(messages, identity)).toBe(900);
  expect(input.runtimeContext.compactionMeasurement?.()).toEqual({ source: 'measured' });
  compaction.onCompact?.({} as never);
  expect(input.runtimeContext.compactionMeasurement?.()).toBeUndefined();
});

it.each(['config', 'session', 'provider', 'workspace'] as const)('invalidates actual evaluator diagnostics after a %s change', change => {
  const input = fixture();
  let resolution = main;
  const resources = createProviderResources({ ...input, sessionManager: setup.manager,
    providerRuntimeBridge: { resolveCredentialSnapshot: () => resolution } }, input.providers);
  const start = () => resources.startRun({ config: input.config, catalog, publication: input.configuration.current,
    backgroundSignal: new AbortController().signal, sessionId: setup.session.id,
    admission: () => undefined, getSourceEntryId: () => undefined });
  const compaction = start()(main).compaction!;
  compaction.policy.measureContextTokens?.([]);
  expect(input.runtimeContext.compactionMeasurement?.()?.source).toBe('estimated');
  if (change === 'config') input.configuration.transition(input.binding);
  if (change === 'session') input.runtimeContext.session = { ...setup.session, id: 'other-session' };
  if (change === 'provider') resolution = { ...main, credential: { ...main.credential!, apiKey: 'synthetic-new-generation' } };
  if (change === 'workspace') input.runtimeContext.projectRoot = `${setup.root}/other`;
  expect(input.runtimeContext.compactionMeasurement?.()).toBeUndefined();
  resolution = main;
  input.runtimeContext.session = setup.session;
  input.runtimeContext.projectRoot = setup.root;
  compaction.policy.measureContextTokens?.([]);
  expect(input.runtimeContext.compactionMeasurement?.()).toBeUndefined();
});
